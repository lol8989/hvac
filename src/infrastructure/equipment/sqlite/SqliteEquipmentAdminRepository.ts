// 장비마스터 관리 리포지토리 SQLite 어댑터 (EquipmentAdminRepository 구현).
// 읽기: 게시 상태 무관 전 제품을 4단 분류 조인으로 평탄 조회.
// 쓰기: 도메인 불변식(게시본 잠금·허용 전이·필드 유효성)을 먼저 강제한 뒤 트랜잭션으로 반영하고,
//       성공 시에만 onChange()로 영속(IndexedDB 저장)을 트리거한다.

import type { Database } from 'sql.js'
import type { BulkStatusResult, EquipmentAdminRepository, ProductRow, SeriesOption } from '../../../application/equipment/adminPorts'
import type { PublishStatus } from '../../../domain/equipment/PublishStatus'
import { assertTransition, assertSpecEditable, canTransition, PUBLISH_STATUS } from '../../../domain/equipment/PublishStatus'
import { publishBlockReason, type PublishCandidate } from '../../../domain/equipment/Publishability'
import { EquipmentDomainError } from '../../../domain/equipment/errors'
import { assertValidDraft, assertValidPatch, type ProductDraft, type ProductPatch } from '../../../domain/equipment/ProductDraft'
import type { ImportRow } from '../../../domain/equipment/SpecImport'
import { queryRows, numOrNull, strOrNull } from './query'

const LIST_SQL = `
  SELECT p.id, c.code AS category_code, c.name_ko AS category_name,
         sc.name_ko AS subcategory_name, sc.energy_source,
         s.code AS series_code, s.name_ko AS series_name, p.model_code, p.equipment_code,
         p.horsepower, p.cooling_capacity_w, p.heating_capacity_w, p.max_connections, p.status,
         p.created_at, p.updated_at, p.published_at
  FROM products p
  JOIN product_series s        ON p.series_id = s.id
  JOIN product_subcategories sc ON s.subcategory_id = sc.id
  JOIN product_categories c     ON sc.category_id = c.id
  ORDER BY c.sort_order, p.id
`

const SERIES_SQL = `
  SELECT s.code, s.name_ko, c.code AS category_code, c.name_ko AS category_name,
         sc.name_ko AS subcategory_name, sc.energy_source
  FROM product_series s
  JOIN product_subcategories sc ON s.subcategory_id = sc.id
  JOIN product_categories c     ON sc.category_id = c.id
  ORDER BY c.sort_order, s.id
`

export interface AdminRepoDeps {
  onChange?: () => void // 쓰기 성공 후 영속 훅(db.export() → IndexedDB)
  now?: () => string // 타임스탬프 주입(테스트 결정성)
}

// 수정 시 병합 검증에 쓰는 현재 스펙.
interface CurrentSpec {
  status: PublishStatus
  coolingW: number | null
  heatingW: number | null
}

export class SqliteEquipmentAdminRepository implements EquipmentAdminRepository {
  private readonly onChange: () => void
  private readonly now: () => string

  constructor(
    private readonly db: Database,
    deps: AdminRepoDeps = {},
  ) {
    this.onChange = deps.onChange ?? (() => {})
    this.now = deps.now ?? (() => new Date().toISOString())
  }

  // ── 읽기 ──

  listProducts(): ProductRow[] {
    return queryRows(this.db, LIST_SQL).map((r) => ({
      id: r.id as number,
      categoryCode: String(r.category_code),
      categoryName: String(r.category_name),
      subcategoryName: String(r.subcategory_name),
      energySource: strOrNull(r.energy_source),
      seriesCode: String(r.series_code),
      seriesName: String(r.series_name),
      modelCode: String(r.model_code),
      equipmentCode: strOrNull(r.equipment_code),
      horsepower: numOrNull(r.horsepower),
      coolingW: numOrNull(r.cooling_capacity_w),
      heatingW: numOrNull(r.heating_capacity_w),
      maxConnections: numOrNull(r.max_connections),
      status: String(r.status) as PublishStatus,
      createdAt: strOrNull(r.created_at),
      updatedAt: strOrNull(r.updated_at),
      publishedAt: strOrNull(r.published_at),
    }))
  }

  listSeries(): SeriesOption[] {
    return queryRows(this.db, SERIES_SQL).map((r) => ({
      code: String(r.code),
      nameKo: String(r.name_ko),
      categoryCode: String(r.category_code),
      categoryName: String(r.category_name),
      subcategoryName: String(r.subcategory_name),
      energySource: strOrNull(r.energy_source),
    }))
  }

  // ── 쓰기 ──

  createProduct(draft: ProductDraft): number {
    assertValidDraft(draft)
    const seriesId = this.seriesIdOf(draft.seriesCode)
    this.assertModelCodeFree(draft.modelCode, null)

    const ts = this.now()
    return this.inTransaction(() => {
      this.db.run(
        `INSERT INTO products
           (series_id, model_code, equipment_code, horsepower, cooling_capacity_w, heating_capacity_w,
            max_connections, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          seriesId,
          draft.modelCode.trim(),
          draft.equipmentCode?.trim() ?? null,
          draft.horsepower,
          draft.coolingW,
          draft.heatingW,
          draft.maxConnections,
          PUBLISH_STATUS.DRAFT, // 신규는 항상 DRAFT (게시 게이트)
          ts,
          ts,
        ],
      )
      return this.lastInsertId()
    })
  }

  updateProduct(id: number, patch: ProductPatch): void {
    assertValidPatch(patch)
    const cur = this.currentSpec(id)
    assertSpecEditable(cur.status) // 게시본 잠금: DRAFT만 수정 가능

    if (patch.modelCode !== undefined) this.assertModelCodeFree(patch.modelCode, id)
    this.assertMergedCapacity(cur, patch)

    const sets: string[] = []
    const params: unknown[] = []
    const put = (col: string, v: unknown) => {
      sets.push(`${col} = ?`)
      params.push(v)
    }

    if (patch.seriesCode !== undefined) put('series_id', this.seriesIdOf(patch.seriesCode))
    if (patch.modelCode !== undefined) put('model_code', patch.modelCode.trim())
    if (patch.equipmentCode !== undefined) put('equipment_code', patch.equipmentCode?.trim() ?? null)
    if (patch.horsepower !== undefined) put('horsepower', patch.horsepower)
    if (patch.coolingW !== undefined) put('cooling_capacity_w', patch.coolingW)
    if (patch.heatingW !== undefined) put('heating_capacity_w', patch.heatingW)
    if (patch.maxConnections !== undefined) put('max_connections', patch.maxConnections)
    if (!sets.length) return // 빈 패치 = no-op (영속 훅도 부르지 않는다)

    put('updated_at', this.now())
    params.push(id)
    this.inTransaction(() => {
      this.db.run(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`, params as never[])
    })
  }

  setStatus(id: number, next: PublishStatus): void {
    const cur = this.currentSpec(id)
    assertTransition(cur.status, next) // 선형 + 재게시만 허용

    // 게시하는 순간 생성·검도가 소비한다 → 소비측 불변식을 만족하지 못하면 막는다.
    if (next === PUBLISH_STATUS.PUBLISHED) {
      const reason = publishBlockReason(this.candidateOf(id)!)
      if (reason) throw new EquipmentDomainError('INVALID_FIELD', reason)
    }

    const ts = this.now()
    // 게시 시각은 게시할 때 기록하고, 보관 해제(재게시) 시 단종일을 해제한다.
    const publishedAt = next === PUBLISH_STATUS.PUBLISHED ? ts : null
    const discontinuedAt = next === PUBLISH_STATUS.ARCHIVED ? ts : null

    this.inTransaction(() => {
      this.db.run(
        `UPDATE products
            SET status = ?,
                published_at    = CASE WHEN ? IS NOT NULL THEN ? ELSE published_at END,
                discontinued_at = ?,
                updated_at = ?
          WHERE id = ?`,
        [next, publishedAt, publishedAt, discontinuedAt, ts, id],
      )
    })
  }

  setStatusMany(ids: readonly number[], next: PublishStatus): BulkStatusResult {
    const skipped: Array<{ id: number; modelCode: string; reason: string }> = []
    const targets: number[] = []

    for (const id of ids) {
      const cur = this.candidateOf(id)
      if (!cur) {
        skipped.push({ id, modelCode: `id=${id}`, reason: '존재하지 않는 제품입니다' })
        continue
      }
      if (!canTransition(cur.status, next)) {
        skipped.push({ id, modelCode: cur.modelCode, reason: `${cur.status} → ${next} 전이는 허용되지 않습니다` })
        continue
      }
      if (next === PUBLISH_STATUS.PUBLISHED) {
        const reason = publishBlockReason(cur)
        if (reason) {
          skipped.push({ id, modelCode: cur.modelCode, reason })
          continue
        }
      }
      targets.push(id)
    }

    if (!targets.length) return { applied: 0, skipped }

    const ts = this.now()
    const publishedAt = next === PUBLISH_STATUS.PUBLISHED ? ts : null
    const discontinuedAt = next === PUBLISH_STATUS.ARCHIVED ? ts : null

    this.inTransaction(() => {
      for (const id of targets) {
        this.db.run(
          `UPDATE products
              SET status = ?,
                  published_at    = CASE WHEN ? IS NOT NULL THEN ? ELSE published_at END,
                  discontinued_at = ?,
                  updated_at = ?
            WHERE id = ?`,
          [next, publishedAt, publishedAt, discontinuedAt, ts, id],
        )
      }
    })
    return { applied: targets.length, skipped }
  }

  importProducts(seriesCode: string, rows: readonly ImportRow[]): number {
    const seriesId = this.seriesIdOf(seriesCode)
    const targets = rows.filter((r) => r.verdict === 'OK')
    if (!targets.length) return 0

    const ts = this.now()
    return this.inTransaction(() => {
      for (const { product, horsepower } of targets) {
        this.db.run(
          `INSERT INTO products
             (series_id, model_code, horsepower, cooling_capacity_w, heating_capacity_w,
              max_connections, status, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            seriesId,
            product.modelCode.trim(),
            horsepower,
            product.coolingW,
            product.heatingW,
            product.maxConnections,
            PUBLISH_STATUS.DRAFT, // 업로드본은 항상 DRAFT — 관리자가 확인 후 게시
            ts,
            ts,
          ],
        )
        // 롱테일 스펙(전원·배관경·전선·차단기·냉매…)은 JSON으로 통째 보존 → 일람표 확장에서 조인.
        this.db.run(`INSERT INTO product_specs (product_id, spec_data) VALUES (?,?)`, [
          this.lastInsertId(),
          JSON.stringify(product.specData),
        ])
      }
      return targets.length
    })
  }

  // ── 내부 헬퍼 ──

  // 쓰기를 원자적으로 실행하고, 성공 시에만 영속 훅을 부른다. 실패 시 롤백.
  private inTransaction<T>(fn: () => T): T {
    this.db.run('BEGIN')
    let out: T
    try {
      out = fn()
    } catch (e) {
      this.db.run('ROLLBACK')
      throw e
    }
    this.db.run('COMMIT')
    this.onChange()
    return out
  }

  private lastInsertId(): number {
    return queryRows(this.db, 'SELECT last_insert_rowid() AS id')[0].id as number
  }

  private seriesIdOf(seriesCode: string): number {
    const rows = queryRows(this.db, 'SELECT id FROM product_series WHERE code = ?', [seriesCode.trim()])
    if (!rows.length) throw new EquipmentDomainError('NOT_FOUND', `존재하지 않는 시리즈입니다: ${seriesCode}`)
    return rows[0].id as number
  }

  // 게시 전제조건 판정에 필요한 최소 정보(대분류 포함).
  private candidateOf(id: number): (PublishCandidate & { status: PublishStatus }) | null {
    const rows = queryRows(
      this.db,
      `SELECT p.status, p.model_code, p.cooling_capacity_w, p.heating_capacity_w, p.horsepower, p.max_connections,
              c.code AS category_code
         FROM products p
         JOIN product_series s         ON p.series_id = s.id
         JOIN product_subcategories sc ON s.subcategory_id = sc.id
         JOIN product_categories c     ON sc.category_id = c.id
        WHERE p.id = ?`,
      [id],
    )
    if (!rows.length) return null
    const r = rows[0]
    return {
      status: String(r.status) as PublishStatus,
      categoryCode: String(r.category_code),
      modelCode: String(r.model_code),
      coolingW: numOrNull(r.cooling_capacity_w),
      heatingW: numOrNull(r.heating_capacity_w),
      horsepower: numOrNull(r.horsepower),
      maxConnections: numOrNull(r.max_connections),
    }
  }

  private currentSpec(id: number): CurrentSpec {
    const rows = queryRows(this.db, 'SELECT status, cooling_capacity_w, heating_capacity_w FROM products WHERE id = ?', [id])
    if (!rows.length) throw new EquipmentDomainError('NOT_FOUND', `존재하지 않는 제품입니다: id=${id}`)
    const r = rows[0]
    return {
      status: String(r.status) as PublishStatus,
      coolingW: numOrNull(r.cooling_capacity_w),
      heatingW: numOrNull(r.heating_capacity_w),
    }
  }

  // 모델명은 전역 고유. 자기 자신(excludeId)은 중복으로 보지 않는다.
  private assertModelCodeFree(modelCode: string, excludeId: number | null): void {
    const rows = queryRows(this.db, 'SELECT id FROM products WHERE model_code = ?', [modelCode.trim()])
    const clash = rows.some((r) => r.id !== excludeId)
    if (clash) throw new EquipmentDomainError('DUPLICATE_MODEL_CODE', `이미 등록된 모델명입니다: ${modelCode}`)
  }

  // 패치를 현재 스펙에 병합한 결과가 '용량 전무'면 거부한다(도메인 불변식).
  private assertMergedCapacity(cur: CurrentSpec, patch: ProductPatch): void {
    const cooling = patch.coolingW !== undefined ? patch.coolingW : cur.coolingW
    const heating = patch.heatingW !== undefined ? patch.heatingW : cur.heatingW
    if (cooling === null && heating === null) {
      throw new EquipmentDomainError('INVALID_FIELD', '냉방 또는 난방 용량 중 하나는 남겨야 합니다')
    }
  }
}

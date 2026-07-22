// 장비마스터 관리 리포지토리 SQLite 어댑터 (EquipmentAdminRepository 구현).
//
// 통합 포트(EquipmentAdminRepository) 하나를 4개 액터로 분리된 세 리포지토리로 조합한다:
//   · 제품(등록·수정·게시·업로드·조회) → SqliteProductRepository
//   · 조합비 정책(전역·모델별 override)  → SqliteComboPolicyRepository
//   · 실내외기 호환 기준표               → SqliteCompatMatrixRepository
// 각자 다른 테이블·다른 변경 이유를 가지므로 파일을 나눴다(§5.6/§5.8). 공유하는 트랜잭션·
// 영속 훅·타임스탬프는 SqliteTx가 갖고, 세 리포지토리가 같은 인스턴스를 공유한다.

import type { Database } from 'sql.js'
import type { BulkStatusResult, EquipmentAdminRepository, ProductRow, SeriesOption } from '../../../application/equipment/adminPorts'
import type { PublishStatus } from '../../../domain/equipment/PublishStatus'
import type { ComboPolicy } from '../../../domain/equipment/ComboPolicy'
import type { CompatMatrix, CompatValue, CompatAxis } from '../../../domain/equipment/CompatMatrix'
import type { ComboRange } from '../../../domain/shared/ComboRange'
import type { ProductDraft, ProductPatch } from '../../../domain/equipment/ProductDraft'
import type { ImportRow } from '../../../domain/equipment/SpecImport'
import { SqliteTx, type SqliteTxDeps } from './SqliteTx'
import { SqliteProductRepository } from './SqliteProductRepository'
import { SqliteComboPolicyRepository } from './SqliteComboPolicyRepository'
import { SqliteCompatMatrixRepository } from './SqliteCompatMatrixRepository'

export type AdminRepoDeps = SqliteTxDeps

export class SqliteEquipmentAdminRepository implements EquipmentAdminRepository {
  private readonly products: SqliteProductRepository
  private readonly comboPolicy: SqliteComboPolicyRepository
  private readonly compat: SqliteCompatMatrixRepository

  constructor(db: Database, deps: AdminRepoDeps = {}) {
    const tx = new SqliteTx(db, deps)
    this.products = new SqliteProductRepository(tx)
    this.comboPolicy = new SqliteComboPolicyRepository(tx)
    this.compat = new SqliteCompatMatrixRepository(tx)
  }

  // ── 제품 ──
  listProducts(): ProductRow[] {
    return this.products.listProducts()
  }
  listSeries(): SeriesOption[] {
    return this.products.listSeries()
  }
  createProduct(draft: ProductDraft): number {
    return this.products.createProduct(draft)
  }
  updateProduct(id: number, patch: ProductPatch): void {
    this.products.updateProduct(id, patch)
  }
  setStatus(id: number, next: PublishStatus): void {
    this.products.setStatus(id, next)
  }
  setStatusMany(ids: readonly number[], next: PublishStatus): BulkStatusResult {
    return this.products.setStatusMany(ids, next)
  }
  importProducts(seriesCode: string, rows: readonly ImportRow[]): number {
    return this.products.importProducts(seriesCode, rows)
  }

  // ── 조합비 정책 ──
  getComboPolicy(): ComboPolicy {
    return this.comboPolicy.getComboPolicy()
  }
  saveGlobalComboRange(range: ComboRange): void {
    this.comboPolicy.saveGlobalComboRange(range)
  }
  setProductComboRange(modelCode: string, range: ComboRange | null): void {
    this.comboPolicy.setProductComboRange(modelCode, range)
  }

  // ── 실내외기 호환 기준표 ──
  getCompatMatrix(): CompatMatrix {
    return this.compat.getCompatMatrix()
  }
  setCompatCell(
    outdoor: Pick<CompatAxis, 'subcategory' | 'series'>,
    indoor: Pick<CompatAxis, 'subcategory' | 'series'>,
    value: CompatValue,
  ): void {
    this.compat.setCompatCell(outdoor, indoor, value)
  }
  clearCompatForOutdoor(outdoor: Pick<CompatAxis, 'subcategory' | 'series'>): void {
    this.compat.clearCompatForOutdoor(outdoor)
  }
}

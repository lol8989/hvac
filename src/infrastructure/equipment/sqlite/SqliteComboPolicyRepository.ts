// 조합비 정책 리포지토리 — 전역 허용범위(system_settings)와 모델별 override(products.combo_*).
// 정책은 스펙이 아니다 → 게시본 스펙 잠금(SPEC_LOCKED)을 적용하지 않는다.

import { ComboPolicy } from '../../../domain/equipment/ComboPolicy'
import { ComboRange } from '../../../domain/shared/ComboRange'
import { EquipmentDomainError } from '../../../domain/equipment/errors'
import { COMBO_MAX_KEY, COMBO_MIN_KEY } from './settingsKeys'
import { queryRows, numOrNull } from './query'
import type { SqliteTx } from './SqliteTx'

export class SqliteComboPolicyRepository {
  constructor(private readonly tx: SqliteTx) {}

  private get db() {
    return this.tx.db
  }

  getComboPolicy(): ComboPolicy {
    const settings = queryRows(this.db, `SELECT key, value FROM system_settings WHERE key IN (?,?)`, [COMBO_MIN_KEY, COMBO_MAX_KEY])
    const s = new Map(settings.map((r) => [String(r.key), Number(r.value)]))
    const global = this.safeRange(s.get(COMBO_MIN_KEY), s.get(COMBO_MAX_KEY)) ?? ComboRange.DEFAULT

    const rows = queryRows(this.db, `SELECT model_code, combo_min, combo_max FROM products WHERE combo_min IS NOT NULL AND combo_max IS NOT NULL`)
    const overrides = new Map<string, ComboRange>()
    for (const r of rows) {
      const range = this.safeRange(numOrNull(r.combo_min) ?? undefined, numOrNull(r.combo_max) ?? undefined, null)
      if (range) overrides.set(String(r.model_code), range)
    }
    return new ComboPolicy(global, overrides)
  }

  saveGlobalComboRange(range: ComboRange): void {
    this.assertRange(range)
    this.tx.run(() => {
      const put = `INSERT INTO system_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      this.db.run(put, [COMBO_MIN_KEY, String(range.min)])
      this.db.run(put, [COMBO_MAX_KEY, String(range.max)])
    })
  }

  setProductComboRange(modelCode: string, range: ComboRange | null): void {
    if (range !== null) this.assertRange(range)
    const code = modelCode.trim()
    const found = queryRows(this.db, `SELECT id FROM products WHERE model_code = ?`, [code])
    if (!found.length) throw new EquipmentDomainError('NOT_FOUND', `존재하지 않는 모델입니다: ${modelCode}`)

    this.tx.run(() => {
      this.db.run(`UPDATE products SET combo_min = ?, combo_max = ?, updated_at = ? WHERE model_code = ?`, [
        range === null ? null : range.min,
        range === null ? null : range.max,
        this.tx.now(),
        code,
      ])
    })
  }

  // 저장된 값이 불변식을 깨면(수기 조작·마이그레이션 사고) 기본으로 떨어뜨린다.
  private safeRange(min: number | undefined, max: number | undefined, fallback: ComboRange | null = ComboRange.DEFAULT): ComboRange | null {
    if (min === undefined || max === undefined) return fallback
    try {
      return new ComboRange(min, max)
    } catch {
      return fallback
    }
  }

  private assertRange(range: ComboRange): void {
    // ComboRange VO가 이미 자기검증하지만, 포트를 우회해 평범한 객체가 들어올 수 있다.
    try {
      new ComboRange(range.min, range.max)
    } catch (e) {
      throw new EquipmentDomainError('INVALID_FIELD', e instanceof Error ? e.message : '조합비 허용범위가 올바르지 않습니다')
    }
  }
}

// product_specs 조회 어댑터. 지금까지 INSERT 경로만 있었고 SELECT가 없었다.
//
// 일람표는 '선정된 모델'을 그린다 — 게시 상태로 거르지 않는다.
// (생성단이 소비하는 카탈로그는 이미 PUBLISHED 게이트를 통과한 뒤다.)

import type { Database } from 'sql.js'
import type { EquipmentSpecRepository } from '../../../application/equipment/specPorts'
import type { SpecData } from '../../../domain/equipment/SpecLookup'
import { queryRows } from './query'

export class SqliteSpecRepository implements EquipmentSpecRepository {
  constructor(private readonly db: Database) {}

  specsOf(modelCodes: readonly string[]): Map<string, SpecData> {
    const out = new Map<string, SpecData>()
    if (!modelCodes.length) return out

    const placeholders = modelCodes.map(() => '?').join(',')
    const rows = queryRows(
      this.db,
      `SELECT p.model_code, s.spec_data
         FROM product_specs s
         JOIN products p ON p.id = s.product_id
        WHERE p.model_code IN (${placeholders})`,
      [...modelCodes],
    )

    for (const r of rows) {
      // spec_data는 TEXT(JSON)다. 다른 타입이면 손대지 않는다.
      const raw = typeof r.spec_data === 'string' ? r.spec_data : ''
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as SpecData
        if (parsed && Object.keys(parsed).length) out.set(String(r.model_code), parsed)
      } catch {
        // 깨진 JSON은 조용히 건너뛴다 — 일람표는 '-'로 남는다(값을 지어내지 않는다).
      }
    }
    return out
  }
}

// series_compat(관리자 편집 override) + 현업 확정 시드 → 도메인 CompatMatrix.
// 관리 리포지토리(편집)와 생성/검도(소비)가 같은 조회 규칙을 공유하도록 한 곳에 둔다.

import type { Database } from 'sql.js'
import type { CompatMatrix, CompatValue } from '../../../domain/equipment/CompatMatrix'
import { compatMatrixFromSeed, buildOverrideKey } from '../seed/compatMatrixFromSeed'
import { queryRows } from './query'

export function readCompatMatrix(db: Database): CompatMatrix {
  const rows = queryRows(db, `SELECT outdoor_subcategory, outdoor_series, indoor_subcategory, indoor_series, value FROM series_compat`)
  const overrides = new Map<string, CompatValue>()
  for (const r of rows) {
    const key = buildOverrideKey(
      { subcategory: String(r.outdoor_subcategory), series: String(r.outdoor_series) },
      { subcategory: String(r.indoor_subcategory), series: String(r.indoor_series) },
    )
    overrides.set(key, String(r.value) as CompatValue)
  }
  return compatMatrixFromSeed(overrides)
}

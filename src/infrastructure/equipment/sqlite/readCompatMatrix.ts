// 실내기↔실외기 호환 매트릭스를 **게시 카탈로그(product_series)에서 파생**해 만든다.
// 축(행=실외기 시리즈, 열=실내기 시리즈)은 카탈로그에서 오므로, 장비마스터에 새 시리즈가 생기면
// 조합관리에 자동으로 행/열이 나타난다(관리자·생성이 같은 규칙을 공유).
//
// 각 칸 값의 우선순위: series_compat override > 현업 확정 시드(seedValueAt) > 기본 'X'(불가).
// 즉 시드는 '알려진 쌍의 기본값'으로만 쓰이고, 시드에 없는 새 시리즈 쌍은 기본 불가(관리자가 켠다).
// 카탈로그가 비어 있으면(초기화 실패 등) 시드 그대로로 폴백한다.

import type { Database } from 'sql.js'
import { CompatMatrix, type CompatAxis, type CompatValue } from '../../../domain/equipment/CompatMatrix'
import { compatMatrixFromSeed, buildOverrideKey, seedValueAt } from '../seed/compatMatrixFromSeed'
import { queryRows } from './query'

// 한 대분류(INDOOR/OUTDOOR)의 시리즈를 (중분류·시리즈·계열) 축으로. (중분류,시리즈)로 유일해야 하므로 GROUP BY.
const AXES_SQL = `
  SELECT sc.name_ko AS subcategory, s.name_ko AS series, MIN(s.energy_source) AS energy_source, MIN(c.sort_order) AS ord
  FROM product_series s
  JOIN product_subcategories sc ON s.subcategory_id = sc.id
  JOIN product_categories c     ON sc.category_id = c.id
  WHERE c.code = ?
  GROUP BY sc.name_ko, s.name_ko
  ORDER BY ord, energy_source, subcategory, series
`

function readAxes(db: Database, category: 'INDOOR' | 'OUTDOOR'): CompatAxis[] {
  return queryRows(db, AXES_SQL, [category]).map((r) => ({
    energySource: r.energy_source == null ? '' : String(r.energy_source),
    subcategory: String(r.subcategory),
    series: String(r.series),
  }))
}

function readOverrides(db: Database): Map<string, CompatValue> {
  const rows = queryRows(db, `SELECT outdoor_subcategory, outdoor_series, indoor_subcategory, indoor_series, value FROM series_compat`)
  const overrides = new Map<string, CompatValue>()
  for (const r of rows) {
    const key = buildOverrideKey(
      { subcategory: String(r.outdoor_subcategory), series: String(r.outdoor_series) },
      { subcategory: String(r.indoor_subcategory), series: String(r.indoor_series) },
    )
    overrides.set(key, String(r.value) as CompatValue)
  }
  return overrides
}

// 카탈로그에 그 (대분류·중분류·시리즈) 시리즈가 실재하는가 — setCompatCell 축 검증용.
export function compatAxisExists(db: Database, axis: { subcategory: string; series: string }, category: 'INDOOR' | 'OUTDOOR'): boolean {
  const rows = queryRows(
    db,
    `SELECT 1 FROM product_series s
       JOIN product_subcategories sc ON s.subcategory_id = sc.id
       JOIN product_categories c     ON sc.category_id = c.id
      WHERE c.code = ? AND sc.name_ko = ? AND s.name_ko = ? LIMIT 1`,
    [category, axis.subcategory, axis.series],
  )
  return rows.length > 0
}

// 시드 기본값 ?? 'X'. series_compat의 delete-on-equal(빈 테이블=기본값) 판정과 getCompatMatrix가 공유한다.
export const compatDefaultValue = (outdoor: { subcategory: string; series: string }, indoor: { subcategory: string; series: string }): CompatValue =>
  seedValueAt(outdoor, indoor) ?? 'X'

export function readCompatMatrix(db: Database): CompatMatrix {
  const outdoorRows = readAxes(db, 'OUTDOOR')
  const indoorCols = readAxes(db, 'INDOOR')
  const overrides = readOverrides(db)
  // 카탈로그가 비면(부팅 실패 등) 시드 축으로 폴백 — 빈 매트릭스보다 확정 조합표가 낫다.
  if (!outdoorRows.length || !indoorCols.length) return compatMatrixFromSeed(overrides)

  const rowValues = outdoorRows.map((o) => indoorCols.map((i) => overrides.get(buildOverrideKey(o, i)) ?? compatDefaultValue(o, i)).join(''))
  return new CompatMatrix(outdoorRows, indoorCols, rowValues)
}

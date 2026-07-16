// 현업 확정 조합표 시드(compatMatrixSeed) → 도메인 CompatMatrix 조립 (infrastructure 어댑터).
// 도메인은 시드를 모른다 — 조립 책임은 여기(infrastructure)에 둔다(Clean Architecture).

import { CompatMatrix, AXIS_SEP, type CompatAxis, type CompatValue } from '../../../domain/equipment/CompatMatrix'
import { COMPAT_INDOOR_COLUMNS, COMPAT_OUTDOOR_ROWS } from './compatMatrixSeed'

type AxisLabel = { subcategory: string; series: string }

const toAxis = (a: { energySource: string; subcategory: string; series: string }): CompatAxis => ({
  energySource: a.energySource,
  subcategory: a.subcategory,
  series: a.series,
})

// 시드 그대로의 확정 매트릭스. overrides가 있으면 (key → 값)으로 덮어써 사용자 편집본을 만든다.
// overrides 키는 buildOverrideKey로 만든다.
export function compatMatrixFromSeed(overrides?: ReadonlyMap<string, CompatValue>): CompatMatrix {
  const rows = COMPAT_OUTDOOR_ROWS.map(toAxis)
  const cols = COMPAT_INDOOR_COLUMNS.map(toAxis)
  const rowValues = COMPAT_OUTDOOR_ROWS.map((row, r) => {
    if (!overrides || overrides.size === 0) return row.values
    const seedChars = [...row.values]
    return cols.map((col, c) => overrides.get(buildOverrideKey(rows[r], col)) ?? (seedChars[c] as CompatValue)).join('')
  })
  return new CompatMatrix(rows, cols, rowValues)
}

// 시드 기본값 한 칸을 매트릭스를 만들지 않고 직접 조회한다. 없는 축이면 null.
// (검증·되돌리기 판정용 — 전체 매트릭스 조립 비용을 피한다.)
export function seedValueAt(outdoor: AxisLabel, indoor: AxisLabel): CompatValue | null {
  const r = COMPAT_OUTDOOR_ROWS.findIndex((o) => o.subcategory === outdoor.subcategory && o.series === outdoor.series)
  const c = COMPAT_INDOOR_COLUMNS.findIndex((i) => i.subcategory === indoor.subcategory && i.series === indoor.series)
  if (r < 0 || c < 0) return null
  return [...COMPAT_OUTDOOR_ROWS[r].values][c] as CompatValue
}

// override 저장/조회 키 — (실외기 중분류·시리즈, 실내기 중분류·시리즈). 저장소 키와 일치시킨다.
// 도메인 CompatMatrix가 축 키에 쓰는 것과 같은 구분자(AXIS_SEP)로 잇는다 — 라벨엔 등장하지 않는다
// (CompatMatrix가 불변식으로 강제). 빈 문자열로 이으면 필드 경계가 사라져 키가 충돌한다.
export function buildOverrideKey(outdoor: AxisLabel, indoor: AxisLabel): string {
  return [outdoor.subcategory, outdoor.series, indoor.subcategory, indoor.series].join(AXIS_SEP)
}

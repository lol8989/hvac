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

// 시드 라벨에 섞인 현업 주석을 떼어 카탈로그의 깨끗한 시리즈명과 매칭되게 한다.
//   "Multi V S(주거) (4way->1way수정)" → "Multi V S(주거)",  "천장형(확인요망)" → "천장형",
//   "Multi V S(주거)->주거가 아니라 냉방전용인듯합니다" → "Multi V S(주거)".
// 정당한 괄호((고급형)·(R32)·(주거) 등)는 보존한다 — '확인요망/수정'이 든 꼬리 괄호와 '->' 이후만 뗀다.
const cleanSeedLabel = (s: string): string =>
  s
    .replace(/\s*\([^)]*(확인요망|수정)[^)]*\)\s*$/, '')
    .replace(/->.*$/, '')
    .trim()

// 시드 기본값 한 칸을 매트릭스를 만들지 않고 직접 조회한다(카탈로그의 깨끗한 라벨로 조회). 없는 축이면 null.
// (카탈로그-파생 매트릭스의 기본값·되돌리기 판정용 — 전체 매트릭스 조립 비용을 피한다.)
// 중분류(subcategory) 명칭 체계가 시드(현업 표기)와 카탈로그(우리 분류)에서 다르다.
// 예) 현업 '시스템보일러 | Multi V 실내기(시스템보일러)' ↔ 카탈로그 '기타 실내기 | 〃'
// 중분류가 안 맞으면 현업 확정값을 못 받고 기본 X로 떨어진다(1368칸 중 318칸, 2026-07-20 실측).
//
// 그래서 중분류가 어긋나면 **시리즈명으로** 되짚는다. 안전한 경우에만 채택한다.
//   · 후보가 하나면 그 값 — 중분류 이름만 다른 1:1이다
//   · 후보가 여럿이어도 값이 전부 같으면 그 값 — 중분류를 어떻게 가르든 현업 판정이 하나다
//   · 후보들의 값이 갈리면 null — 사람이 정해야 한다(임의로 고르면 현업 판정을 날조하는 것이다)
// 근거·남은 결정: doc/05_설계결정/실내외기_조합_확인표_현업회신_반영_2026-07-16.md §6
const bySeries = <T extends { series: string }>(axes: readonly T[], series: string): number[] =>
  axes.reduce<number[]>((acc, a, i) => (cleanSeedLabel(a.series) === series ? [...acc, i] : acc), [])

const unanimous = (values: readonly CompatValue[]): CompatValue | null => {
  const first = values[0]
  return values.length > 0 && values.every((v) => v === first) ? first : null
}

export function seedValueAt(outdoor: AxisLabel, indoor: AxisLabel): CompatValue | null {
  const cellAt = (r: number, c: number): CompatValue => [...COMPAT_OUTDOOR_ROWS[r].values][c] as CompatValue

  const exactRow = COMPAT_OUTDOOR_ROWS.findIndex((o) => cleanSeedLabel(o.subcategory) === outdoor.subcategory && cleanSeedLabel(o.series) === outdoor.series)
  const exactCol = COMPAT_INDOOR_COLUMNS.findIndex((i) => cleanSeedLabel(i.subcategory) === indoor.subcategory && cleanSeedLabel(i.series) === indoor.series)
  if (exactRow >= 0 && exactCol >= 0) return cellAt(exactRow, exactCol)

  // 중분류가 어긋난 축은 시리즈명으로 되짚는다.
  const rows = exactRow >= 0 ? [exactRow] : bySeries(COMPAT_OUTDOOR_ROWS, outdoor.series)
  const cols = exactCol >= 0 ? [exactCol] : bySeries(COMPAT_INDOOR_COLUMNS, indoor.series)
  if (rows.length === 0 || cols.length === 0) return null

  return unanimous(rows.flatMap((r) => cols.map((c) => cellAt(r, c))))
}

// override 저장/조회 키 — (실외기 중분류·시리즈, 실내기 중분류·시리즈). 저장소 키와 일치시킨다.
// 도메인 CompatMatrix가 축 키에 쓰는 것과 같은 구분자(AXIS_SEP)로 잇는다 — 라벨엔 등장하지 않는다
// (CompatMatrix가 불변식으로 강제). 빈 문자열로 이으면 필드 경계가 사라져 키가 충돌한다.
export function buildOverrideKey(outdoor: AxisLabel, indoor: AxisLabel): string {
  return [outdoor.subcategory, outdoor.series, indoor.subcategory, indoor.series].join(AXIS_SEP)
}

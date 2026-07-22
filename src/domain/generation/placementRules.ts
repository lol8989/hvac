// 실내기 자동배치 룰 — 순수 도메인. 타입 결정 · 대수 결정.
//
// 근거: Confluence「실내기·실외기 자동배치 룰」 ②③ + 0708 회의 수정 룰.
// 수정 룰이 원본을 두 군데 덮어쓴다:
//   · 4WAY 확산반경  4.0m → 4.5m
//   · 2WAY 폭 경계   "4m 미만" → "3m 이하"
//
// 그 결과 짧은 폭 3m 초과 4m 미만 구간은 2WAY(≤3m)에도 4WAY(≥4m)에도 걸리지 않아 1WAY가 된다.
// 원문 그대로의 귀결이며, 임의로 메우지 않는다.

export const INDOOR_TYPES = ['1WAY', '2WAY', '4WAY'] as const
export type IndoorType = (typeof INDOOR_TYPES)[number]

// 4WAY는 형상 규칙의 경계이자 "4kW 이상 기본"의 결과다.
const FOURWAY_MIN_SHORT_SIDE_M = 4.0
const TWOWAY_MAX_SHORT_SIDE_M = 3.0
const TWOWAY_MIN_LONG_SIDE_M = 4.0
const FOURWAY_MIN_LOAD_W = 4000

// 확산반경(도달거리)과 방향성 손실. 커버면적 = πr² × factor.
export const COVERAGE: Record<IndoorType, { radiusM: number; factor: number }> = {
  '4WAY': { radiusM: 4.5, factor: 1.0 }, // 0708 수정(원본 4.0m)
  '2WAY': { radiusM: 4.0, factor: 0.6 },
  '1WAY': { radiusM: 3.5, factor: 0.4 }, // 소용량 기준. 대용량은 아래 LARGE_1WAY
}

// 1WAY는 용량에 따라 반경이 다르다: 2.0~4.0kW → 3.5m, 5.2~7.2kW → 5.0m
const LARGE_1WAY_MIN_W = 5000
const LARGE_1WAY_RADIUS_M = 5.0

// 근소한 용량 부족 허용폭. 두 근거가 이 지점에서 어긋나 주인님이 3%로 확정했다(2026-07-10).
//   · 표준 260415 장비선정표 엑셀: 3255.8W → 32C(3200W) 1대 = 1.72% 부족을 인정한 산출물
//   · 0708 회의 예시: 190kW → 52×4(208kW). 60×3(180kW)이 채택되려면 5.26% 부족이 필요
// 둘을 동시에 만족시키는 구간은 1.72%~5.26%뿐이며 그 중앙값을 취한다.
// 대수 규칙(unitCountFor)의 부하 기준에 적용되는 단일 정책이다.
export const SHORTFALL_TOLERANCE = 0.03

// 3200 / (3200/0.97 × 0.97) 같은 경계값이 부동소수 오차로 1.0000000000000002가 되어
// ceil이 한 대를 더 얹는 것을 막는다.
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6

export interface RoomShape {
  shortSideM: number
  longSideM: number
  requiredCoolW: number
  residential: boolean // 단위세대(주거·오피스텔)
  corridor: boolean
}

const assertPositive = (v: number, name: string): void => {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name}은(는) 0보다 큰 유한수여야 합니다`)
}

// 위에서부터 먼저 걸리는 조건을 적용한다.
export function indoorTypeFor(shape: RoomShape): IndoorType {
  // 0708 수정: 단위세대는 무조건 1WAY — 부하·형상보다 우선한다.
  if (shape.residential) return '1WAY'

  const short = Math.min(shape.shortSideM, shape.longSideM)
  const long = Math.max(shape.shortSideM, shape.longSideM)

  // 0708 수정: 4kW 이상은 복도가 아닌 실이면 4WAY 기본.
  if (!shape.corridor && shape.requiredCoolW >= FOURWAY_MIN_LOAD_W) return '4WAY'

  if (short >= FOURWAY_MIN_SHORT_SIDE_M) return '4WAY' // 폭이 확보되면 1WAY 2대보다 4WAY 1대
  if (short <= TWOWAY_MAX_SHORT_SIDE_M && long > TWOWAY_MIN_LONG_SIDE_M) return '2WAY' // 좁고 긴 방
  return '1WAY'
}

// 1대가 실제로 담당하는 면적(㎡). 방향성 손실을 반영한다.
export function effectiveCoverageM2(type: IndoorType, modelCoolW: number): number {
  const { radiusM, factor } = COVERAGE[type]
  const r = type === '1WAY' && modelCoolW >= LARGE_1WAY_MIN_W ? LARGE_1WAY_RADIUS_M : radiusM
  return Math.PI * r * r * factor
}

export interface UnitCountInput {
  requiredCoolW: number
  areaM2: number
  type: IndoorType
  modelCoolW: number // 대수를 셀 모델의 냉방용량(그 모델만으로 채운다)
  coverageOverrideM2?: number // 수동 지정 시 확산범위 기준을 대체한다
}

// 한 모델로 실을 채울 때의 대수 — 부하 기준과 확산범위 기준 중 큰 값(최소 1대).
// 이 규칙이 정본이다: selectIndoorModel이 후보마다 이 함수를 호출한다(중복 제거).
// 부하 기준에는 SHORTFALL_TOLERANCE(근소 부족 허용)와 round6(부동소수 경계 보정)를 적용한다.
export function unitCountFor({ requiredCoolW, areaM2, type, modelCoolW, coverageOverrideM2 }: UnitCountInput): number {
  assertPositive(requiredCoolW, 'requiredCoolW')
  assertPositive(areaM2, 'areaM2')
  assertPositive(modelCoolW, 'modelCoolW')

  const satisfiable = requiredCoolW * (1 - SHORTFALL_TOLERANCE)
  const byLoad = Math.ceil(round6(satisfiable / modelCoolW))
  const coverage = coverageOverrideM2 ?? effectiveCoverageM2(type, modelCoolW)
  const byCoverage = Math.ceil(areaM2 / coverage)

  return Math.max(1, byLoad, byCoverage)
}

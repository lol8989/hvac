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
  maxModelCoolW: number // 그 타입의 최대 용량 모델 — 대수를 최소화하려면 큰 용량을 쓴다
  coverageOverrideM2?: number // 수동 지정 시 확산범위 기준을 대체한다
}

// 부하 기준과 확산범위 기준 중 큰 값. 최소 1대.
export function unitCountFor({ requiredCoolW, areaM2, type, maxModelCoolW, coverageOverrideM2 }: UnitCountInput): number {
  assertPositive(requiredCoolW, 'requiredCoolW')
  assertPositive(areaM2, 'areaM2')
  assertPositive(maxModelCoolW, 'maxModelCoolW')

  const byLoad = Math.ceil(requiredCoolW / maxModelCoolW)
  const coverage = coverageOverrideM2 ?? effectiveCoverageM2(type, maxModelCoolW)
  const byCoverage = Math.ceil(areaM2 / coverage)

  return Math.max(1, byLoad, byCoverage)
}

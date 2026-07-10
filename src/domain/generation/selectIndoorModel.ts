// 실내기 모델·대수 선정 — 순수 도메인 서비스.
//
// Confluence ④ + 0708 회의 수정 룰:
//   · 타입은 형상·부하로 먼저 정해진다(placementRules.indoorTypeFor).
//   · 한 방에는 초과하더라도 **동일 용량**으로 배치한다. 용량을 섞지 않는다.
//     (0708 예시: 190kW 필요 · 장비 52/60/72 → 52×4(=208). 52×1+72×2(=196)가 아니다.)
//   · 대수는 부하 기준과 확산범위 기준 중 큰 값(placementRules.unitCountFor).
//   · 후보 중 총용량이 가장 작은 조합을 고른다(과대선정 방지).
//
// 기존 recommendIndoor를 대체한다.

import type { IndoorModel } from './IndoorModel'
import { effectiveCoverageM2, indoorTypeFor, type IndoorType } from './placementRules'

// 근소한 용량 부족 허용폭. 두 근거가 이 지점에서 어긋나 주인님이 3%로 확정했다(2026-07-10).
//   · 표준 260415 장비선정표 엑셀: 3255.8W → 32C(3200W) 1대 = 1.72% 부족을 인정한 산출물
//   · 0708 회의 예시: 190kW → 52×4(208kW). 여기서 60×3(180kW)이 채택되려면 5.26% 부족이 필요
// 둘을 동시에 만족시키는 구간은 1.72%~5.26%뿐이며 그 중앙값을 취한다.
// 이 값을 5.26% 이상으로 올리면 0708 예시가 깨지고, 1.72% 미만으로 내리면 엑셀 사례가 깨진다.
export const SHORTFALL_TOLERANCE = 0.03

export interface SelectIndoorInput {
  requiredCoolW: number
  areaM2: number
  shape: { shortSideM: number; longSideM: number; residential: boolean; corridor: boolean }
  models: readonly IndoorModel[]
  coverageOverrideM2?: number
}

export interface IndoorSelectionResult {
  type: IndoorType
  model: IndoorModel
  quantity: number
  totalCoolW: number
}

// 3200 / (3200/0.97 × 0.97) 같은 경계값이 부동소수 오차로 1.0000000000000002가 되어
// ceil이 한 대를 더 얹는 것을 막는다.
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6

// 모델 유형 문자열('4WAY 카세트', '1WAY 카세트')에서 타입을 읽는다.
const typeOf = (model: IndoorModel, type: IndoorType): boolean => model.type.includes(type)

export function selectIndoorModel({ requiredCoolW, areaM2, shape, models, coverageOverrideM2 }: SelectIndoorInput): IndoorSelectionResult {
  if (!Number.isFinite(requiredCoolW) || requiredCoolW <= 0) throw new Error('requiredCoolW는 0보다 큰 유한수여야 합니다')
  if (!Number.isFinite(areaM2) || areaM2 <= 0) throw new Error('areaM2는 0보다 큰 유한수여야 합니다')
  if (!models.length) throw new Error('models는 비어있지 않은 목록이어야 합니다')

  const type = indoorTypeFor({ ...shape, requiredCoolW })
  const candidates = models.filter((m) => typeOf(m, type))
  if (!candidates.length) throw new Error(`카탈로그에 ${type} 실내기가 없습니다`)

  // 부하 기준 대수: 허용 부족폭만큼 낮춘 부하를 넘기는 최소 대수.
  const satisfiable = requiredCoolW * (1 - SHORTFALL_TOLERANCE)

  // 각 모델을 '그 모델만으로' 채웠을 때의 대수. 확산범위 하한은 모델 용량에 따라 달라진다(1WAY 반경).
  let best: IndoorSelectionResult | null = null
  for (const model of candidates) {
    const byLoad = Math.ceil(round6(satisfiable / model.coolW))
    const coverage = coverageOverrideM2 ?? effectiveCoverageM2(type, model.coolW)
    const byCoverage = Math.ceil(areaM2 / coverage)
    const quantity = Math.max(1, byLoad, byCoverage)
    const totalCoolW = quantity * model.coolW

    // 총용량 최소 → 대수 최소 → 목록 앞(최신형)
    if (
      best === null ||
      totalCoolW < best.totalCoolW ||
      (totalCoolW === best.totalCoolW && quantity < best.quantity)
    ) {
      best = { type, model, quantity, totalCoolW }
    }
  }
  return best!
}

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
import { indoorTypeFor, unitCountFor, type IndoorType } from './placementRules'

// 부족 허용폭은 대수 규칙(placementRules)이 소유한다 — 여기서는 하위호환 재export만 한다.
export { SHORTFALL_TOLERANCE } from './placementRules'

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

// 모델 유형 문자열('4WAY 카세트', '1WAY 카세트')에서 타입을 읽는다.
const typeOf = (model: IndoorModel, type: IndoorType): boolean => model.type.includes(type)

export function selectIndoorModel({ requiredCoolW, areaM2, shape, models, coverageOverrideM2 }: SelectIndoorInput): IndoorSelectionResult {
  if (!Number.isFinite(requiredCoolW) || requiredCoolW <= 0) throw new Error('requiredCoolW는 0보다 큰 유한수여야 합니다')
  if (!Number.isFinite(areaM2) || areaM2 <= 0) throw new Error('areaM2는 0보다 큰 유한수여야 합니다')
  if (!models.length) throw new Error('models는 비어있지 않은 목록이어야 합니다')

  const type = indoorTypeFor({ ...shape, requiredCoolW })
  const candidates = models.filter((m) => typeOf(m, type))
  if (!candidates.length) throw new Error(`카탈로그에 ${type} 실내기가 없습니다`)

  // 각 모델을 '그 모델만으로' 채웠을 때의 대수는 정본 규칙(unitCountFor)이 정한다
  // — 부하 기준(부족허용·경계보정 포함)·확산범위 기준의 큰 값. 여기서 규칙을 재구현하지 않는다.
  let best: IndoorSelectionResult | null = null
  for (const model of candidates) {
    const quantity = unitCountFor({ requiredCoolW, areaM2, type, modelCoolW: model.coolW, coverageOverrideM2 })
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

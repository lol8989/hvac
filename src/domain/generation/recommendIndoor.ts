// AI 실내기 기본 선정 순수 함수 (Generation 컨텍스트 · Domain Service).
// 필요 냉방부하(W)에 대해 모델별 최적 대수를 구하고 score가 최소인 모델을 추천한다.
// 근거: 표준 260415 장비선정표 엑셀 — 근소한 용량 부족은 허용된다 (예: 3255.8W → 32C×1).
//
// 규칙:
//  - 모델별 대수 qty: 필요부하를 가장 가깝게 맞추는 대수(최소 1).
//    raw = requiredCoolW / coolW 의 floor/ceil 두 후보 중 score가 작은 쪽을 고르고,
//    동률이면 적은 대수를 택한다. (부하가 모델 용량의 배수를 크게 넘으면 ceil로 커진다)
//  - score = |qty × coolW − requiredCoolW|
//  - 선택: score 최소 → 동률이면 대수(qty) 적은 것 → 그래도 동률이면 목록 앞의 모델(결정론)
//
// Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 함수.

import type { IndoorModel, IndoorSelection } from './IndoorModel'

// 해당 모델로 필요부하에 가장 근접하는 대수(최소 1)를 구한다.
const bestQtyFor = (requiredCoolW: number, coolW: number): number => {
  const raw = requiredCoolW / coolW
  const down = Math.max(1, Math.floor(raw))
  const up = Math.max(1, Math.ceil(raw))
  const scoreDown = Math.abs(down * coolW - requiredCoolW)
  const scoreUp = Math.abs(up * coolW - requiredCoolW)
  return scoreUp < scoreDown ? up : down // 동률이면 적은 대수(down)
}

export const recommendIndoor = (
  requiredCoolW: number,
  models: readonly IndoorModel[],
): IndoorSelection => {
  if (typeof requiredCoolW !== 'number' || !Number.isFinite(requiredCoolW) || requiredCoolW <= 0) {
    throw new Error('requiredCoolW는 0보다 큰 유한수여야 합니다')
  }
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('models는 비어있지 않은 목록이어야 합니다')
  }

  let best: { readonly model: IndoorModel; readonly quantity: number; readonly score: number } | null =
    null

  for (const m of models) {
    const quantity = bestQtyFor(requiredCoolW, m.coolW)
    const score = Math.abs(quantity * m.coolW - requiredCoolW)
    if (best === null || score < best.score || (score === best.score && quantity < best.quantity)) {
      best = { model: m, quantity, score }
    }
  }

  // models가 비어있지 않음을 위에서 보장했으므로 best는 항상 존재한다.
  if (best === null) throw new Error('실내기 추천 결과를 계산하지 못했습니다')
  return Object.freeze({ modelCode: best.model.code, quantity: best.quantity })
}

// 재계산 연쇄 도메인 서비스 (Generation 컨텍스트 · Domain Service).
// "상류 수정(면적·용도·단위부하) → 하류 재계산(배치·총용량)" 연쇄를 순수 함수로 제공한다.
// 정책 핵심: AI 재실행 시 사용자 수정 셀(user 오버라이드)은 보존된다(withAiSelection).
// Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

import type { Room } from './Room'
import type { IndoorModel, IndoorSelection } from './IndoorModel'
import { Placement } from './Placement'
import { selectIndoorModel } from './selectIndoorModel'

// 실 하나에 대한 AI 선정 결과. 배치·심볼표시·오버라이드 해제가 모두 이 함수를 지나야
// 같은 규칙을 본다(규칙이 호출부마다 흩어지지 않는다).
export const aiSelectionFor = (room: Room, models: readonly IndoorModel[]): IndoorSelection => {
  const selected = selectIndoorModel({
    requiredCoolW: room.requiredLoadW.cool,
    areaM2: room.areaM2,
    shape: room.shape,
    models,
  })
  return Object.freeze({ modelCode: selected.model.code, quantity: selected.quantity })
}

// AI 배치 (재)실행: 각 실의 형상·부하로 selectIndoorModel을 돌려 Placement의 AI값을 갱신.
// 타입(1/2/4WAY)은 실 형상이 정하고, 대수는 부하와 확산범위 중 큰 쪽이 정한다.
// - 기존 placement가 있으면 withAiSelection(user 오버라이드 보존), 없으면 Placement.ai로 생성.
// - rooms 목록에 없는 실의 기존 placement는 그대로 유지한다.
// - 반환은 roomId → Placement의 새 Record(원본 비파괴).
export const applyAiPlacement = (
  rooms: readonly Room[],
  placements: Readonly<Record<string, Placement>>,
  models: readonly IndoorModel[],
): Record<string, Placement> => {
  const next: Record<string, Placement> = { ...placements }
  for (const room of rooms) {
    const recommended = aiSelectionFor(room, models)
    const existing = placements[room.id]
    next[room.id] =
      existing !== undefined
        ? existing.withAiSelection(recommended)
        : Placement.ai(room.id, recommended)
  }
  return next
}

// 카탈로그에서 modelCode로 모델 조회. 없으면 throw(정합 보호).
const findModel = (models: readonly IndoorModel[], modelCode: string): IndoorModel => {
  const found = models.find((m) => m.code === modelCode)
  if (found === undefined) {
    throw new Error(`카탈로그에 없는 모델 코드입니다: ${modelCode}`)
  }
  return found
}

// 실별 유효 배치 총용량(W). 카탈로그에 없는 modelCode는 throw(정합 보호).
export const placementTotalsW = (
  placement: Placement,
  models: readonly IndoorModel[],
): { coolW: number; heatW: number } => {
  const model = findModel(models, placement.effectiveSelection.modelCode)
  return placement.totals(model)
}

// 그룹(실 id 목록)의 실내기 총용량(W). placement 없는 실은 0으로 계상.
export const groupIndoorTotalsW = (
  roomIds: readonly string[],
  placements: Readonly<Record<string, Placement>>,
  models: readonly IndoorModel[],
): { coolW: number; heatW: number } => {
  let coolW = 0
  let heatW = 0
  for (const roomId of roomIds) {
    const placement = placements[roomId]
    if (placement === undefined) continue // 배치 없는 실은 0 계상
    const totals = placementTotalsW(placement, models)
    coolW += totals.coolW
    heatW += totals.heatW
  }
  return { coolW, heatW }
}

// 심볼을 놓은 위치가 소속을 정한다 — 순수 도메인 규칙 (주인님 결정 2026-07-23, 안 a).
//
// 도면 심볼 1개 = 실내기 1대 = 선정표 대수 1(CLAUDE.md §9). 예전에는 심볼을 다른 실로 끌어다 놔도
// 소속(roomId)이 그대로라, 화면 하이라이팅은 '놓인 실'을 가리키는데 선정표는 원래 실에서 세는
// 어긋남이 있었다. 이제 **드래그가 실 간 이동**이다: 원래 실 대수 −1, 놓인 실 대수 +1.
//
// 모델은 옮기지 않는다 — 한 실은 동일 모델이다(실내기_자동배치_룰 §4). 옮겨간 대수는 **대상 실의**
// 모델을 따른다. 그래서 여기서는 "어느 실로 갈지"만 정하고, 모델·좌표 적용은 호출자가 한다.
//
// 어느 실도 아닌 곳에 놓으면 옮기지 않는다(소속 유지). 그건 실수일 수도, 아직 놓는 중일 수도 있어
// 소속을 지우는 대신 misplacedUnits가 확정 전에 경고한다.
import type { Polygon } from '../shared/Polygon'

export interface UnitMoveAt {
  roomId: string // 옮기기 전 소속 실
  index: number // 그 실에서 몇 번째 대수인지(0-based)
  x: number
  y: number
}

export interface UnitTransfer {
  from: string
  index: number
  to: string
  x: number
  y: number
}

export interface TransferPlan {
  stays: UnitMoveAt[] // 소속은 그대로, 좌표만 갱신
  transfers: UnitTransfer[] // 실 간 이동(대수가 옮겨간다)
}

export const planUnitTransfers = (
  moves: readonly UnitMoveAt[],
  shapes: Readonly<Record<string, Polygon>>,
): TransferPlan => {
  const stays: UnitMoveAt[] = []
  const transfers: UnitTransfer[] = []
  for (const m of moves) {
    const own = shapes[m.roomId]
    // 형상을 모르는 실(자르기·재시딩 중)은 판정하지 않는다 — 임의로 소속을 옮기지 않는다.
    if (!own || own.contains({ x: m.x, y: m.y })) { stays.push(m); continue }
    const to = Object.keys(shapes).find((id) => id !== m.roomId && shapes[id].contains({ x: m.x, y: m.y }))
    if (!to) { stays.push(m); continue } // 어느 실도 아니다 → 소속 유지(가드가 경고)
    transfers.push({ from: m.roomId, index: m.index, to, x: m.x, y: m.y })
  }
  return { stays, transfers }
}

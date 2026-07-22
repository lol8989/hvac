// 실 형상 편집의 도메인 규칙(순수) — 자르기·병합·리사이즈가 배치·형상을 어떻게 바꾸는지.
// 예전엔 이 규칙들이 App 컴포넌트 안에 인라인돼 있었다(뷰+서비스 엉킴). 컴포넌트는 이 함수를
// 부르고 결과를 World에 커밋할 뿐, "어느 자식에 심볼이 속하나 · 어느 모델을 승계하나 · 면적을
// 어떻게 다시 유도하나"는 여기(도메인)가 판단한다.

import { Placement } from './Placement'
import type { Room } from './Room'
import { Polygon } from '../shared/Polygon'
import type { Pt } from '../shared/Polygon'
import type { UnitPosition } from './layoutPositions'

// 절단선 위에 정확히 놓인 심볼은 두 조각 모두에 '포함'된다 → 무게중심이 가까운 쪽으로 보낸다.
// (어느 쪽에도 안 걸리는 경우도 여기로 온다 — 심볼은 반드시 한 실에 속해야 대수가 맞는다.)
function nearestChild<T extends { poly: Polygon }>(cs: readonly T[], p: Pt): T {
  const d2 = (c: T) => (c.poly.centroid.x - p.x) ** 2 + (c.poly.centroid.y - p.y) ** 2
  return cs.reduce((best, c) => (d2(c) < d2(best) ? c : best), cs[0])
}

// 자르기: 부모의 실내기 심볼을 좌표로 나눠 자식에게 준다. 조각에 심볼이 없으면 그 실은 '미배치'다
// (quantity>=1 불변식을 우회하지 않는다). 부모가 '수정 셀'(사용자 오버라이드)이면 자식도 승계한다
// — 아니면 다음 AI 재배치가 사용자의 선택을 조용히 덮는다(수정 셀 보존 정책).
export function splitPlacementAcrossChildren(
  parent: Placement | undefined,
  children: readonly { id: string; poly: Polygon }[],
): Record<string, Placement> {
  const out: Record<string, Placement> = {}
  if (!parent) return out
  const model = parent.effectiveSelection.modelCode
  const overridden = parent.isOverridden
  const byChild: Record<string, UnitPosition[]> = Object.fromEntries(children.map((c) => [c.id, []]))
  for (const pos of parent.positions) {
    const hit = children.find((c) => c.poly.contains(pos)) ?? nearestChild(children, pos)
    byChild[hit.id].push(pos)
  }
  for (const c of children) {
    const pos = byChild[c.id]
    if (pos.length === 0) continue
    const sel = { modelCode: model, quantity: pos.length }
    const base = Placement.ai(c.id, sel, pos)
    out[c.id] = overridden ? base.overrideSelection(sel, pos) : base
  }
  return out
}

// 병합: 두 실의 심볼을 그대로 합친다. 모델이 다르면 대수가 많은 쪽(동수면 면적이 큰 쪽)을 승계한다
// — 한 실은 한 모델(실내기_자동배치_룰 §4). 어느 쪽이든 오버라이드였으면 결과도 오버라이드.
// 좌표가 하나도 없으면 null(합친 실엔 실내기 없음).
export function mergePlacements(
  pa: Placement | undefined,
  pb: Placement | undefined,
  mergedRoomId: string,
  areaA: number,
  areaB: number,
): Placement | null {
  const positions = [...(pa?.positions ?? []), ...(pb?.positions ?? [])]
  if (positions.length === 0) return null
  const na = pa?.positions.length ?? 0
  const nb = pb?.positions.length ?? 0
  const dominant = na === nb ? (areaA >= areaB ? pa : pb) : na > nb ? pa : pb
  const owner = dominant ?? pa ?? pb
  if (!owner) return null // 좌표가 있는데 배치가 없을 수는 없다(방어)
  const sel = { modelCode: owner.effectiveSelection.modelCode, quantity: positions.length }
  const base = Placement.ai(mergedRoomId, sel, positions)
  const overridden = (pa?.isOverridden ?? false) || (pb?.isOverridden ?? false)
  return overridden ? base.overrideSelection(sel, positions) : base
}

// 리사이즈: 형상만 바꾸면 도면과 표가 다른 실을 말한다(면적·치수가 검출값에 머묾). 실의 축척(m/단위)을
// 지키면서 새 폴리곤에서 면적·단변·장변을 다시 유도한다 — 자르기와 같은 규칙.
export function reshapeRoom(room: Room, prevPoly: Polygon, nextPoly: Polygon): Room {
  const mPerUnit = Math.sqrt(room.areaM2 / prevPoly.area) // 이 실의 축척은 리사이즈로 변하지 않는다
  const areaM2 = nextPoly.area * mPerUnit * mPerUnit
  const { shortSide, longSide } = nextPoly.obb()
  return room.withShape(areaM2, shortSide * mPerUnit, longSide * mPerUnit)
}

// 실외기 그룹별 색상 — 도크(매핑 표)와 도면(SVG)이 같은 색을 쓰기 위한 SSOT.
// 생성 영역 무채색 규칙의 예외(주인님 지시 2026-07-21). 도면 방/실내기 하이라이팅도
// 도크 탭 색깔과 동일하게 한다(주인님 결정 2026-07-22).
//
// head = 탭(헤더)·테두리 색(흰 글자 대비 확보), tint = 실내기 행/방 배경(연한 동일 색상).

import type { DockFloorView } from './dockView'

export interface GroupColor {
  head: string
  tint: string
}

export const GROUP_PALETTE: GroupColor[] = [
  { head: '#2f5fae', tint: '#eef3fb' }, // 블루
  { head: '#1f8a80', tint: '#e8f5f3' }, // 틸
  { head: '#a9720f', tint: '#fbf2e3' }, // 앰버
  { head: '#b23a5b', tint: '#fbebf0' }, // 로즈
  { head: '#6b4bb0', tint: '#f1edf9' }, // 바이올렛
  { head: '#2f7d3a', tint: '#eaf5ec' }, // 그린
  { head: '#1c7a95', tint: '#e7f3f7' }, // 시안
  { head: '#8a5a3c', tint: '#f4ece6' }, // 브라운
  { head: '#3f5b8a', tint: '#eef1f7' }, // 슬레이트
  { head: '#9c3d84', tint: '#f6eaf2' }, // 마젠타
]

// 그룹 key → 색상. 층을 가로지르는 순서(층 → 그룹)로 배정한다. 팔레트를 넘으면 순환한다.
// 도크와 도면이 같은 순서를 써야 색이 일치하므로 이 함수가 유일한 배정 규칙이다.
export function assignGroupColors(floors: readonly DockFloorView[]): Map<string, GroupColor> {
  const map = new Map<string, GroupColor>()
  let i = 0
  for (const f of floors) for (const g of f.groups) { map.set(g.key, GROUP_PALETTE[i % GROUP_PALETTE.length]); i++ }
  return map
}

// 실 id → 그 실이 속한 실외기 그룹의 색상. 도면이 방·실내기를 색칠할 때 쓴다.
// 미배정 실(어느 그룹에도 없는 실)은 맵에 없다 → 도면에서 무채색으로 남는다.
export function roomColorMap(floors: readonly DockFloorView[]): Record<string, GroupColor> {
  const byGroup = assignGroupColors(floors)
  const out: Record<string, GroupColor> = {}
  for (const f of floors) for (const g of f.groups) {
    const color = byGroup.get(g.key)
    if (!color) continue
    for (const r of g.rooms) out[r.roomId] = color
  }
  return out
}

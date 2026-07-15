// 층별 실 그룹 + bbox 파생 (Generation 프레젠테이션).
// 뷰어 층 전환이 쓰는 뷰 모델: 정렬된 층 목록 + 층별 실 id + 그 층을 감쌀 축정렬 bbox.
// 층은 한 DXF 안에 '나란히' 배치되므로(주인님 확정 2026-07-15) 층 bbox로 fit하면 다른 층이 자연 격리된다.
// 설계: doc/05_설계결정/층_전환_설계_v1.md §4~5

import type { Room } from '../../domain/generation/Room'
import type { Polygon } from '../../domain/shared/Polygon'
import { floorOrder } from '../../domain/generation/floorOrder'

export interface FloorInfo {
  floor: string // 층 식별자(원문 — 탭 표시용으로 그대로 보존)
  roomIds: string[] // 그 층 실 id(형상 없는 실도 포함)
  bbox: { x: number; y: number; w: number; h: number } | null // geom 좌표계. 형상 있는 실이 없으면 null
}

// geom은 실 형상 SSOT(App.roomGeom). 실이 잘리거나 병합되면 여기 반영된다.
export function floorsOf(rooms: Record<string, Room>, geom: Record<string, Polygon>): FloorInfo[] {
  const byFloor = new Map<string, string[]>()
  for (const id of Object.keys(rooms)) {
    const f = rooms[id].floor
    const arr = byFloor.get(f)
    if (arr) arr.push(id)
    else byFloor.set(f, [id])
  }

  const infos: FloorInfo[] = []
  for (const [floor, roomIds] of byFloor) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const id of roomIds) {
      const g = geom[id]
      if (!g) continue
      const b = g.bbox
      minX = Math.min(minX, b.x)
      minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.w)
      maxY = Math.max(maxY, b.y + b.h)
    }
    const bbox = minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    infos.push({ floor, roomIds, bbox })
  }

  return infos.sort((a, b) => floorOrder(a.floor) - floorOrder(b.floor))
}

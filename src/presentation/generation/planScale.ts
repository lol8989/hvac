// 도면 좌표계 환산 (presentation 어댑터).
//
// 실 기하(roomGeom)는 목업 도면 좌표(720×470)에 있고, 뷰어는 실도면(DXF 월드) 좌표로 그린다.
// 두 좌표계의 축척은 x·y가 다르다(비등방) → 각도가 보존되지 않는다.
// 월드에서 45°로 그은 선은 베이스에서 45°가 아니다. 그래서 방향벡터를 옮겨 각도를 다시 구한다.

import type { Pt } from '../../domain/shared/Polygon'
import type { CutLine } from '../../domain/shared/Polygon'

export const BASE_W = 720
export const BASE_H = 470

export interface PlanScale {
  sx: number
  sy: number
}

export const planScaleOf = (dims: { w: number; h: number } | null | undefined): PlanScale =>
  dims ? { sx: dims.w / BASE_W, sy: dims.h / BASE_H } : { sx: 1, sy: 1 }

export const scalePoints = (points: readonly Pt[], { sx, sy }: PlanScale): Pt[] =>
  points.map((p) => ({ x: p.x * sx, y: p.y * sy }))

// 월드(뷰어)에서 그은 절단선 → 베이스(실 기하) 좌표계.
export const worldLineToBase = (line: CutLine, { sx, sy }: PlanScale): CutLine => {
  const rad = (line.angleDeg * Math.PI) / 180
  const dx = Math.cos(rad) / sx
  const dy = Math.sin(rad) / sy
  return {
    x: line.x / sx,
    y: line.y / sy,
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  }
}

// 월드에서 찍은 점 → 베이스.
export const worldPointToBase = (p: Pt, { sx, sy }: PlanScale): Pt => ({ x: p.x / sx, y: p.y / sy })

import { describe, it, expect } from 'vitest'
import { planScaleOf, scalePoints, worldLineToBase, BASE_W, BASE_H } from './planScale'
import { Polygon } from '../../domain/shared/Polygon'

describe('planScale — 월드(뷰어) ↔ 베이스(실 기하) 좌표계', () => {
  it('타일이 없으면 축척은 1이다(목업 좌표계 그대로)', () => {
    expect(planScaleOf(null)).toEqual({ sx: 1, sy: 1 })
  })

  it('타일이 있으면 목업 720×470을 도면 크기로 늘린다', () => {
    expect(planScaleOf({ w: 1440, h: 940 })).toEqual({ sx: 2, sy: 2 })
  })

  it('가로/세로 축척이 다르면 사선의 각도가 바뀐다', () => {
    const s = { sx: 2, sy: 1 } // 가로만 2배
    // 월드에서 45°로 그은 선 → 베이스에서는 더 가파르다(atan2(1, 0.5) = 63.43°)
    const base = worldLineToBase({ x: 100, y: 50, angleDeg: 45 }, s)
    expect(base.angleDeg).toBeCloseTo(63.435, 2)
    expect(base.x).toBe(50)
    expect(base.y).toBe(50)
  })

  it('수평·수직선은 축척이 달라도 각도가 그대로다', () => {
    const s = { sx: 3, sy: 1 }
    expect(worldLineToBase({ x: 0, y: 0, angleDeg: 0 }, s).angleDeg).toBeCloseTo(0, 6)
    expect(Math.abs(worldLineToBase({ x: 0, y: 0, angleDeg: 90 }, s).angleDeg)).toBeCloseTo(90, 6)
  })

  // 이 변환이 없으면 사용자가 도면에서 그은 선과 실제로 잘리는 선이 어긋난다.
  it('월드에서 자른 넓이 비율과 베이스에서 자른 넓이 비율이 같다', () => {
    const s = { sx: 2.5, sy: 1.2 }
    const basePoly = Polygon.rect(24, 24, 250, 150)
    const worldPoly = Polygon.of(scalePoints(basePoly.points, s))

    const worldLine = { x: 24 * 2.5 + 90, y: 24 * 1.2 + 60, angleDeg: 30 }
    const [wa] = worldPoly.splitByLine(worldLine)
    const [ba] = basePoly.splitByLine(worldLineToBase(worldLine, s))

    expect(ba.area / basePoly.area).toBeCloseTo(wa.area / worldPoly.area, 6)
  })

  it('베이스 좌표계 상수는 목업 도면 크기다', () => {
    expect([BASE_W, BASE_H]).toEqual([720, 470])
  })
})

import { describe, it, expect } from 'vitest'
import { layoutPositions } from './layoutPositions'

const rect = { x: 0, y: 0, w: 120, h: 60 }

describe('layoutPositions (실 사각형 + 대수 → 실내기 좌표)', () => {
  it('1대는 실 중앙에 놓는다', () => {
    expect(layoutPositions(rect, 1)).toEqual([{ x: 60, y: 30, rot: 0 }])
  })

  it('2대는 긴 변을 따라 균등 분산한다', () => {
    // 가로가 길다(120×60) → x축으로 1/4, 3/4 지점
    expect(layoutPositions(rect, 2)).toEqual([
      { x: 30, y: 30, rot: 0 },
      { x: 90, y: 30, rot: 0 },
    ])
  })

  it('세로가 긴 실은 세로로 분산한다', () => {
    expect(layoutPositions({ x: 0, y: 0, w: 60, h: 120 }, 2)).toEqual([
      { x: 30, y: 30, rot: 0 },
      { x: 30, y: 90, rot: 0 },
    ])
  })

  it('4대는 2×2 격자로 놓는다', () => {
    const p = layoutPositions({ x: 0, y: 0, w: 100, h: 100 }, 4)
    expect(p).toHaveLength(4)
    expect(new Set(p.map((q) => q.x))).toEqual(new Set([25, 75]))
    expect(new Set(p.map((q) => q.y))).toEqual(new Set([25, 75]))
  })

  it('실 원점을 반영한다(오프셋)', () => {
    expect(layoutPositions({ x: 200, y: 100, w: 120, h: 60 }, 1)).toEqual([{ x: 260, y: 130, rot: 0 }])
  })

  it('모든 좌표는 실 내부에 있다', () => {
    for (const n of [1, 2, 3, 5, 7, 9]) {
      for (const p of layoutPositions(rect, n)) {
        expect(p.x).toBeGreaterThan(rect.x)
        expect(p.x).toBeLessThan(rect.x + rect.w)
        expect(p.y).toBeGreaterThan(rect.y)
        expect(p.y).toBeLessThan(rect.y + rect.h)
      }
    }
  })

  it('좌표가 서로 겹치지 않는다', () => {
    for (const n of [2, 3, 4, 6]) {
      const keys = layoutPositions(rect, n).map((p) => `${p.x},${p.y}`)
      expect(new Set(keys).size).toBe(n)
    }
  })

  // ─── 적대적 QA ───
  it('[적대] 대수 0이면 빈 배열', () => {
    expect(layoutPositions(rect, 0)).toEqual([])
  })

  it('[적대] 음수·정수 아닌 대수는 예외', () => {
    expect(() => layoutPositions(rect, -1)).toThrow()
    expect(() => layoutPositions(rect, 1.5)).toThrow()
  })

  it('[적대] 폭·높이가 0 이하인 실은 예외', () => {
    expect(() => layoutPositions({ x: 0, y: 0, w: 0, h: 10 }, 1)).toThrow()
    expect(() => layoutPositions({ x: 0, y: 0, w: 10, h: -1 }, 1)).toThrow()
  })
})

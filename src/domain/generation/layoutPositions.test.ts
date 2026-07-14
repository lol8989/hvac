import { describe, it, expect } from 'vitest'
import { layoutPositions } from './layoutPositions'
import { Polygon } from '../shared/Polygon'

const rect = Polygon.rect(0, 0, 120, 60)

describe('layoutPositions (실 폴리곤 + 대수 → 실내기 좌표)', () => {
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
    expect(layoutPositions(Polygon.rect(0, 0, 60, 120), 2)).toEqual([
      { x: 30, y: 30, rot: 0 },
      { x: 30, y: 90, rot: 0 },
    ])
  })

  it('4대는 2×2 격자로 놓는다', () => {
    const p = layoutPositions(Polygon.rect(0, 0, 100, 100), 4)
    expect(p).toHaveLength(4)
    expect(new Set(p.map((q) => q.x))).toEqual(new Set([25, 75]))
    expect(new Set(p.map((q) => q.y))).toEqual(new Set([25, 75]))
  })

  it('실 원점을 반영한다(오프셋)', () => {
    expect(layoutPositions(Polygon.rect(200, 100, 120, 60), 1)).toEqual([{ x: 260, y: 130, rot: 0 }])
  })

  it('모든 좌표는 실 내부에 있다', () => {
    for (const n of [1, 2, 3, 5, 7, 9]) {
      for (const p of layoutPositions(rect, n)) {
        expect(rect.contains(p)).toBe(true)
      }
    }
  })

  it('좌표가 서로 겹치지 않는다', () => {
    for (const n of [2, 3, 4, 6]) {
      const keys = layoutPositions(rect, n).map((p) => `${p.x},${p.y}`)
      expect(new Set(keys).size).toBe(n)
    }
  })

  // ─── 폴리곤(잘린 실) ───
  // bbox 격자를 그대로 쓰면 모서리 셀이 벽 밖에 찍히고, zoneOfPoint가 그 심볼을
  // 옆 실 소속으로 오분류한다(위치가 소속을 이긴다) → 선정표 대수가 옆 실로 넘어간다.
  it('삼각형 실에서도 모든 좌표가 실 내부다', () => {
    const tri = Polygon.of([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }])
    for (const n of [1, 2, 3, 4, 6, 9]) {
      const pts = layoutPositions(tri, n)
      expect(pts).toHaveLength(n)
      for (const p of pts) expect(tri.contains(p)).toBe(true)
      expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(n)
    }
  })

  it('사선으로 잘린 사다리꼴에서도 좌표가 실 내부다', () => {
    const [a, b] = Polygon.rect(0, 0, 200, 100).splitByLine({ x: 100, y: 50, angleDeg: 30 })
    for (const poly of [a, b]) {
      for (const p of layoutPositions(poly, 3)) expect(poly.contains(p)).toBe(true)
    }
  })

  it('아주 얇은 폴리곤에서도 요청한 대수만큼 좌표를 만든다', () => {
    const sliver = Polygon.of([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 6 }, { x: 0, y: 4 }])
    const pts = layoutPositions(sliver, 4)
    expect(pts).toHaveLength(4)
    for (const p of pts) expect(sliver.contains(p)).toBe(true)
  })

  // ─── 적대적 QA ───
  it('[적대] 대수 0이면 빈 배열', () => {
    expect(layoutPositions(rect, 0)).toEqual([])
  })

  it('[적대] 음수·정수 아닌 대수는 예외', () => {
    expect(() => layoutPositions(rect, -1)).toThrow()
    expect(() => layoutPositions(rect, 1.5)).toThrow()
  })
})

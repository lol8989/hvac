import { describe, it, expect } from 'vitest'
import { Polygon } from './Polygon'

const RECT = Polygon.rect(0, 0, 200, 100) // 넓이 20000

describe('Polygon 생성', () => {
  it('점이 3개 미만이면 폴리곤이 아니다', () => {
    expect(() => Polygon.of([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toThrow(/3개/)
  })

  it('좌표가 유한수가 아니면 거부한다', () => {
    expect(() => Polygon.of([{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 5, y: 5 }])).toThrow(/유한수/)
  })

  it('넓이가 0인 도형(한 직선 위의 점들)은 거부한다', () => {
    expect(() => Polygon.of([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toThrow(/넓이/)
  })
})

describe('Polygon.area — shoelace', () => {
  it('직사각형의 넓이는 w × h다', () => {
    expect(RECT.area).toBeCloseTo(20000, 6)
  })

  it('점 순서(시계/반시계)가 뒤집혀도 넓이는 같다', () => {
    const cw = Polygon.of([...RECT.points].reverse())
    expect(cw.area).toBeCloseTo(RECT.area, 6)
  })

  it('삼각형의 넓이는 밑변 × 높이 ÷ 2다', () => {
    const tri = Polygon.of([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 50 }])
    expect(tri.area).toBeCloseTo(2500, 6)
  })
})

describe('Polygon.contains — 경계 포함', () => {
  it('내부의 점은 포함이다', () => {
    expect(RECT.contains({ x: 100, y: 50 })).toBe(true)
  })

  it('경계 위의 점도 포함이다(기존 pointInZone 계약 유지)', () => {
    expect(RECT.contains({ x: 0, y: 0 })).toBe(true)
    expect(RECT.contains({ x: 200, y: 50 })).toBe(true)
  })

  it('바깥의 점은 포함이 아니다', () => {
    expect(RECT.contains({ x: 201, y: 50 })).toBe(false)
    expect(RECT.contains({ x: 100, y: -1 })).toBe(false)
  })

  it('사선으로 잘린 삼각형의 바깥(잘려나간 쪽)은 포함이 아니다', () => {
    const tri = Polygon.of([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }])
    expect(tri.contains({ x: 10, y: 10 })).toBe(true) // 빗변 안쪽
    expect(tri.contains({ x: 90, y: 90 })).toBe(false) // 빗변 바깥
  })
})

describe('Polygon.obb — 최소면적 회전 바운딩박스', () => {
  it('정사각형은 단변 = 장변이다', () => {
    const sq = Polygon.rect(0, 0, 10, 10)
    const { shortSide, longSide } = sq.obb()
    expect(shortSide).toBeCloseTo(10, 6)
    expect(longSide).toBeCloseTo(10, 6)
  })

  it('축정렬 직사각형은 폭·높이를 그대로 낸다', () => {
    const { shortSide, longSide } = Polygon.rect(0, 0, 20, 10).obb()
    expect(shortSide).toBeCloseTo(10, 6)
    expect(longSide).toBeCloseTo(20, 6)
  })

  it('45도 기울어진 정사각형은 축정렬 bbox(14.14)가 아니라 실제 변(10)을 낸다', () => {
    const s = 10 / Math.SQRT2
    const diamond = Polygon.of([
      { x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 },
    ])
    const { shortSide, longSide } = diamond.obb()
    expect(shortSide).toBeCloseTo(10, 4)
    expect(longSide).toBeCloseTo(10, 4)
  })
})

describe('Polygon.splitByLine — 반평면 절단', () => {
  it('직사각형을 세로선으로 자르면 사각형 2개가 나온다', () => {
    const [a, b] = RECT.splitByLine({ x: 100, y: 50, angleDeg: 90 })
    expect(a.points).toHaveLength(4)
    expect(b.points).toHaveLength(4)
    expect(a.area).toBeCloseTo(10000, 6)
    expect(b.area).toBeCloseTo(10000, 6)
  })

  it('두 조각의 넓이 합은 원본과 같다(면적 합 보존)', () => {
    for (const angle of [0, 15, 30, 45, 60, 75, 120]) {
      const pieces = RECT.splitByLine({ x: 90, y: 40, angleDeg: angle })
      const sum = pieces.reduce((s, p) => s + p.area, 0)
      expect(sum).toBeCloseTo(RECT.area, 6)
    }
  })

  it('왼쪽 조각이 먼저 온다(결정적 순서)', () => {
    const [a, b] = RECT.splitByLine({ x: 50, y: 50, angleDeg: 90 })
    expect(a.centroid.x).toBeLessThan(b.centroid.x)
    expect(a.area).toBeCloseTo(5000, 6) // 왼쪽이 좁은 쪽
  })

  it('15도 사선으로 자르면 조각의 정점이 3~5개가 된다', () => {
    const pieces = RECT.splitByLine({ x: 100, y: 50, angleDeg: 15 })
    expect(pieces).toHaveLength(2)
    for (const p of pieces) {
      expect(p.points.length).toBeGreaterThanOrEqual(3)
      expect(p.points.length).toBeLessThanOrEqual(5)
    }
  })

  it('선이 실을 지나지 않으면 원본 하나만 돌려준다', () => {
    const pieces = RECT.splitByLine({ x: 500, y: 500, angleDeg: 90 })
    expect(pieces).toHaveLength(1)
    expect(pieces[0].area).toBeCloseTo(RECT.area, 6)
  })

  it('선이 꼭짓점만 스쳐도 조각을 두 개로 만들지 않는다', () => {
    const pieces = RECT.splitByLine({ x: 0, y: 0, angleDeg: 90 }) // 좌변에 겹치는 선
    expect(pieces).toHaveLength(1)
  })

  // 오목 실은 병합(M)으로 생긴다 — 자를 수 있어야 한다(상세는 Polygon.concave.test.ts).
  it('오목 폴리곤도 넓이를 보존하며 자른다', () => {
    const concave = Polygon.of([
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
      { x: 50, y: 50 }, { x: 0, y: 100 },
    ])
    const pieces = concave.splitByLine({ x: 50, y: 20, angleDeg: 90 })
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    expect(pieces.reduce((s, p) => s + p.area, 0)).toBeCloseTo(concave.area, 6)
  })
})

describe('Polygon.scale — 좌표계 환산', () => {
  it('정점 전체에 비등방 스케일을 적용한다', () => {
    const s = Polygon.rect(10, 20, 100, 50).scale(2, 3)
    expect(s.bbox).toEqual({ x: 20, y: 60, w: 200, h: 150 })
  })
})

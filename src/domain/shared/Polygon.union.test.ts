import { describe, it, expect } from 'vitest'
import { Polygon, unionPolygons, sharedEdgeLength, NotAdjacentError } from './Polygon'

const rect = (x: number, y: number, w: number, h: number) => Polygon.rect(x, y, w, h)

describe('sharedEdgeLength — 인접 판정', () => {
  it('벽을 통째로 공유하면 그 길이가 나온다', () => {
    expect(sharedEdgeLength(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBeCloseTo(100)
  })

  it('벽의 일부만 겹치면 겹친 만큼만 센다', () => {
    // 오른쪽 실이 위로 짧다 → 공유 구간은 60
    expect(sharedEdgeLength(rect(0, 0, 100, 100), rect(100, 40, 100, 60))).toBeCloseTo(60)
  })

  it('꼭짓점만 닿으면 0이다(대각선 접촉은 인접이 아니다)', () => {
    expect(sharedEdgeLength(rect(0, 0, 100, 100), rect(100, 100, 100, 100))).toBe(0)
  })

  it('떨어져 있으면 0이다', () => {
    expect(sharedEdgeLength(rect(0, 0, 100, 100), rect(120, 0, 100, 100))).toBe(0)
  })
})

describe('unionPolygons — 인접한 두 실을 하나로', () => {
  it('나란한 두 사각형을 합치면 사각형 하나가 된다(공유 벽이 사라진다)', () => {
    const u = unionPolygons(rect(0, 0, 100, 100), rect(100, 0, 100, 100))
    expect(u.points).toHaveLength(4)
    expect(u.area).toBeCloseTo(20000)
    expect(u.bbox).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })

  it('넓이는 두 실의 합이다', () => {
    const u = unionPolygons(rect(0, 0, 100, 60), rect(0, 60, 100, 40))
    expect(u.area).toBeCloseTo(100 * 60 + 100 * 40)
  })

  it('벽의 일부만 공유하면 ㄴ자(오목) 폴리곤이 된다', () => {
    const u = unionPolygons(rect(0, 0, 100, 100), rect(100, 0, 60, 40))
    expect(u.area).toBeCloseTo(10000 + 2400)
    expect(u.points.length).toBeGreaterThan(4) // 계단이 생긴다
    expect(u.isConvex).toBe(false)
    // 튀어나온 부분 안의 점은 포함, 빈 곳은 비포함
    expect(u.contains({ x: 130, y: 20 })).toBe(true)
    expect(u.contains({ x: 130, y: 80 })).toBe(false)
  })

  it('공유 벽이 없으면 합치지 않는다', () => {
    expect(() => unionPolygons(rect(0, 0, 100, 100), rect(120, 0, 100, 100))).toThrow(NotAdjacentError)
  })

  it('꼭짓점만 닿아도 합치지 않는다', () => {
    expect(() => unionPolygons(rect(0, 0, 100, 100), rect(100, 100, 50, 50))).toThrow(NotAdjacentError)
  })

  it('사선으로 자른 두 조각을 합치면 원래 사각형이 복원된다(자르기의 역연산)', () => {
    const original = rect(24, 24, 250, 150)
    const [a, b] = original.splitByLine({ x: 149, y: 99, angleDeg: 30 })
    const u = unionPolygons(a, b)
    expect(u.area).toBeCloseTo(original.area, 6)
    expect(u.bbox.w).toBeCloseTo(250, 6)
    expect(u.bbox.h).toBeCloseTo(150, 6)
  })

  it('합집합 결과도 다시 합칠 수 있다(3실 병합)', () => {
    const ab = unionPolygons(rect(0, 0, 100, 100), rect(100, 0, 100, 100))
    const abc = unionPolygons(ab, rect(200, 0, 50, 100))
    expect(abc.area).toBeCloseTo(25000)
  })
})

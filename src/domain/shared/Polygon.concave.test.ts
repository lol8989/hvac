// 오목 폴리곤 절단 — 병합(M)으로 생긴 ㄴ자 실도 다시 자를 수 있어야 한다.
import { describe, it, expect } from 'vitest'
import { Polygon, unionPolygons } from './Polygon'

// ㄴ자: 100×100 왼쪽 블록 + 오른쪽 위 60×40 돌출
const L = unionPolygons(Polygon.rect(0, 0, 100, 100), Polygon.rect(100, 0, 60, 40))

describe('splitByLine — 오목 폴리곤', () => {
  it('오목 실도 자를 수 있다(예전엔 예외를 던졌다)', () => {
    expect(L.isConvex).toBe(false)
    expect(() => L.splitByLine({ x: 50, y: 50, angleDeg: 90 })).not.toThrow()
  })

  it('세로로 자르면 두 조각이고 넓이 합이 보존된다', () => {
    const pieces = L.splitByLine({ x: 50, y: 50, angleDeg: 90 })
    expect(pieces).toHaveLength(2)
    expect(pieces.reduce((s, p) => s + p.area, 0)).toBeCloseTo(L.area, 6)
  })

  it('돌출부를 지나 가로로 자르면 두 조각이고 넓이 합이 보존된다', () => {
    const pieces = L.splitByLine({ x: 50, y: 20, angleDeg: 0 })
    expect(pieces.length).toBeGreaterThanOrEqual(2)
    expect(pieces.reduce((s, p) => s + p.area, 0)).toBeCloseTo(L.area, 6)
  })

  it('오목부를 가로지르는 선은 3조각을 만들 수 있다(도메인은 사실대로 돌려준다)', () => {
    // ㄷ자(가운데가 파인 실)를 세로 중앙에서 자르면 조각이 셋이 될 수 있다
    const U = unionPolygons(
      unionPolygons(Polygon.rect(0, 0, 40, 100), Polygon.rect(40, 0, 40, 30)),
      Polygon.rect(80, 0, 40, 100),
    )
    const pieces = U.splitByLine({ x: 60, y: 60, angleDeg: 0 }) // y=60 가로선
    expect(pieces.reduce((s, p) => s + p.area, 0)).toBeCloseTo(U.area, 6)
    expect(pieces.length).toBeGreaterThanOrEqual(2)
  })

  it('선이 실을 지나지 않으면 원본 하나를 돌려준다', () => {
    expect(L.splitByLine({ x: 500, y: 500, angleDeg: 0 })).toHaveLength(1)
  })

  it('잘린 조각들은 다시 합쳐서 원본이 된다(자르기 ↔ 병합)', () => {
    const [a, b] = L.splitByLine({ x: 50, y: 50, angleDeg: 90 })
    const back = unionPolygons(a, b)
    expect(back.area).toBeCloseTo(L.area, 6)
  })
})

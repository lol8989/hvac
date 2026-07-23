import { describe, it, expect } from 'vitest'
import { roomLabelAnchor, LABEL_INSET } from './roomLabelAnchor'
import { Polygon } from '../../domain/shared/Polygon'

const rect = (x: number, y: number, w: number, h: number) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

const inside = (pts: ReturnType<typeof rect>, p: { x: number; y: number }) => Polygon.of(pts).contains(p)

describe('roomLabelAnchor — 사각형 실', () => {
  it('라벨을 실 위쪽 안(상단에서 인셋만큼 아래)에 둔다', () => {
    const pts = rect(0, 0, 200, 100)
    const a = roomLabelAnchor(pts)
    expect(a.x).toBeCloseTo(100, 6) // 가로는 중앙
    expect(a.y).toBeCloseTo(LABEL_INSET, 6)
  })

  it('무게중심보다 위에 있다 — 실내기 심볼(중앙)과 겹치지 않기 위함', () => {
    const pts = rect(0, 0, 200, 100)
    const a = roomLabelAnchor(pts)
    expect(a.y).toBeLessThan(Polygon.of(pts).centroid.y)
  })

  it('실 안에 있다', () => {
    const pts = rect(24, 24, 272, 135)
    expect(inside(pts, roomLabelAnchor(pts))).toBe(true)
  })
})

describe('roomLabelAnchor — 좁은 실', () => {
  it('인셋보다 낮은 실이면 그 구간의 가운데로 물러난다(밖으로 나가지 않는다)', () => {
    const pts = rect(0, 0, 200, 10)
    const a = roomLabelAnchor(pts)
    expect(a.y).toBeCloseTo(5, 6)
    expect(inside(pts, a)).toBe(true)
  })
})

describe('roomLabelAnchor — 잘린·오목한 실', () => {
  it('사선으로 잘린 실에서도 실 안에 있다', () => {
    // 직각삼각형(빗변이 사선) — 자르기(V) 결과의 전형.
    const pts = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }]
    const a = roomLabelAnchor(pts)
    expect(Polygon.of(pts).contains(a)).toBe(true)
  })

  it('ㄴ자(오목) 실에서도 실 안에 있다', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
      { x: 200, y: 100 }, { x: 200, y: 200 }, { x: 0, y: 200 },
    ]
    const a = roomLabelAnchor(pts)
    expect(Polygon.of(pts).contains(a)).toBe(true)
  })

  it('세로로 두 조각이 나뉜 구간에서도 무게중심이 속한 조각 안에 둔다', () => {
    // ㄷ자를 눕힌 모양: x=150 세로선이 폴리곤을 위/아래 두 구간으로 자른다.
    const pts = [
      { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 60 },
      { x: 100, y: 60 }, { x: 100, y: 140 }, { x: 200, y: 140 },
      { x: 200, y: 200 }, { x: 0, y: 200 },
    ]
    const a = roomLabelAnchor(pts)
    expect(Polygon.of(pts).contains(a)).toBe(true)
  })
})

describe('roomLabelAnchor — 방어적 입력', () => {
  it('정점이 3개 미만이면 그대로 첫 점을 준다(면적이 없다)', () => {
    expect(roomLabelAnchor([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9 })
    expect(roomLabelAnchor([])).toEqual({ x: 0, y: 0 })
  })
})

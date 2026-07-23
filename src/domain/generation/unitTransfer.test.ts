import { describe, it, expect } from 'vitest'
import { planUnitTransfers } from './unitTransfer'
import { Polygon } from '../shared/Polygon'

// 좌우로 나란한 두 실(사이 간격 있음).
const shapes = {
  AC_A: Polygon.of([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]),
  AC_B: Polygon.of([{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 }]),
}

describe('planUnitTransfers — 자기 실 안', () => {
  it('자기 실 안에 놓으면 좌표만 갱신한다(소속은 그대로)', () => {
    const p = planUnitTransfers([{ roomId: 'AC_A', index: 0, x: 50, y: 50 }], shapes)
    expect(p.transfers).toEqual([])
    expect(p.stays).toEqual([{ roomId: 'AC_A', index: 0, x: 50, y: 50 }])
  })

  it('실 경계 위(포함)는 자기 실 안이다', () => {
    const p = planUnitTransfers([{ roomId: 'AC_A', index: 0, x: 0, y: 50 }], shapes)
    expect(p.transfers).toEqual([])
    expect(p.stays).toHaveLength(1)
  })
})

describe('planUnitTransfers — 다른 실로 이동 (위치가 소속을 정한다)', () => {
  it('다른 실 안에 놓으면 그 실로 옮긴다', () => {
    const p = planUnitTransfers([{ roomId: 'AC_A', index: 1, x: 250, y: 50 }], shapes)
    expect(p.stays).toEqual([])
    expect(p.transfers).toEqual([{ from: 'AC_A', index: 1, to: 'AC_B', x: 250, y: 50 }])
  })

  it('여러 대를 한 번에 옮겨도 각각 분류한다', () => {
    const p = planUnitTransfers(
      [
        { roomId: 'AC_A', index: 0, x: 50, y: 50 }, // 제자리
        { roomId: 'AC_A', index: 1, x: 250, y: 50 }, // A → B
        { roomId: 'AC_B', index: 0, x: 999, y: 999 }, // 실 밖
      ],
      shapes,
    )
    expect(p.stays.map((s) => s.index)).toEqual([0, 0])
    expect(p.transfers).toEqual([{ from: 'AC_A', index: 1, to: 'AC_B', x: 250, y: 50 }])
  })

  it('서로 맞바꾸는 이동도 각각 기록한다', () => {
    const p = planUnitTransfers(
      [
        { roomId: 'AC_A', index: 0, x: 250, y: 50 },
        { roomId: 'AC_B', index: 0, x: 50, y: 50 },
      ],
      shapes,
    )
    expect(p.transfers).toEqual([
      { from: 'AC_A', index: 0, to: 'AC_B', x: 250, y: 50 },
      { from: 'AC_B', index: 0, to: 'AC_A', x: 50, y: 50 },
    ])
  })
})

describe('planUnitTransfers — 어느 실도 아닌 곳', () => {
  it('실 밖에 놓으면 옮기지 않는다(소속 유지 — 가드가 경고한다)', () => {
    const p = planUnitTransfers([{ roomId: 'AC_A', index: 0, x: 150, y: 50 }], shapes)
    expect(p.transfers).toEqual([])
    expect(p.stays).toEqual([{ roomId: 'AC_A', index: 0, x: 150, y: 50 }])
  })
})

describe('planUnitTransfers — 방어적 입력', () => {
  it('소속 실의 형상을 모르면 판정하지 않고 좌표만 갱신한다', () => {
    const p = planUnitTransfers([{ roomId: 'GONE', index: 0, x: 250, y: 50 }], shapes)
    expect(p.transfers).toEqual([])
    expect(p.stays).toHaveLength(1)
  })

  it('빈 입력이면 빈 계획이다', () => {
    expect(planUnitTransfers([], shapes)).toEqual({ stays: [], transfers: [] })
  })
})

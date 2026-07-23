import { describe, it, expect } from 'vitest'
import { findMisplacedUnits } from './misplacedUnits'
import { Polygon } from '../shared/Polygon'

// 좌우로 나란한 두 실(사이 간격 있음).
const A = Polygon.of([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])
const B = Polygon.of([{ x: 200, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 100 }, { x: 200, y: 100 }])
const shapes = { AC_A: A, AC_B: B }
const names = { AC_A: '거실', AC_B: '침실' }

describe('findMisplacedUnits — 정상 배치', () => {
  it('모든 심볼이 소속 실 안에 있으면 아무것도 보고하지 않는다', () => {
    const r = findMisplacedUnits({
      units: [
        { roomId: 'AC_A', index: 0, x: 50, y: 50 },
        { roomId: 'AC_B', index: 0, x: 250, y: 50 },
      ],
      shapes,
      names,
    })
    expect(r).toEqual([])
  })

  it('실 경계 위(포함)는 밖이 아니다', () => {
    const r = findMisplacedUnits({ units: [{ roomId: 'AC_A', index: 0, x: 0, y: 50 }], shapes, names })
    expect(r).toEqual([])
  })
})

describe('findMisplacedUnits — 실 밖으로 나간 심볼', () => {
  it('어느 실에도 없는 곳에 놓이면 outside로 보고한다', () => {
    const r = findMisplacedUnits({ units: [{ roomId: 'AC_A', index: 0, x: 150, y: 50 }], shapes, names })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ roomId: 'AC_A', index: 0, roomName: '거실', landedIn: null })
  })

  it('다른 실 위에 놓이면 그 실을 함께 보고한다 (소속은 그대로다)', () => {
    const r = findMisplacedUnits({ units: [{ roomId: 'AC_A', index: 0, x: 250, y: 50 }], shapes, names })
    expect(r).toHaveLength(1)
    expect(r[0].landedIn).toEqual({ roomId: 'AC_B', roomName: '침실' })
  })

  it('여러 대가 나가면 전부 보고하고 입력 순서를 지킨다', () => {
    const r = findMisplacedUnits({
      units: [
        { roomId: 'AC_A', index: 0, x: 50, y: 50 }, // 정상
        { roomId: 'AC_A', index: 1, x: 999, y: 999 }, // 도면 밖
        { roomId: 'AC_B', index: 0, x: 50, y: 50 }, // 남의 실
      ],
      shapes,
      names,
    })
    expect(r.map((m) => `${m.roomId}#${m.index + 1}`)).toEqual(['AC_A#2', 'AC_B#1'])
  })
})

describe('findMisplacedUnits — 방어적 입력', () => {
  it('형상을 모르는 실은 판정하지 않는다(없는 실을 위반으로 만들지 않는다)', () => {
    const r = findMisplacedUnits({ units: [{ roomId: 'GONE', index: 0, x: 50, y: 50 }], shapes, names })
    expect(r).toEqual([])
  })

  it('심볼이 없으면 빈 결과다', () => {
    expect(findMisplacedUnits({ units: [], shapes, names })).toEqual([])
  })

  it('이름을 모르면 실 id로 대신한다', () => {
    const r = findMisplacedUnits({ units: [{ roomId: 'AC_A', index: 0, x: 150, y: 50 }], shapes, names: {} })
    expect(r[0].roomName).toBe('AC_A')
  })
})

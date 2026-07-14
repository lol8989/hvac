import { describe, it, expect } from 'vitest'
import { Room } from './Room'
import { Polygon, NotAdjacentError } from '../shared/Polygon'
import { UnitLoad } from '../shared/UnitLoad'
import { mergeRooms, MergeFloorMismatchError } from './mergeRooms'
import { sliceRoom } from './sliceRoom'
import { indoorTypeFor } from './placementRules'

// 목업과 같은 인접 배치: 거실(24,24 272×135) | 침실1(296,24 158×135)
const 거실 = {
  room: Room.create({ id: 'AC_001', floor: '지상1층', name: '거실', areaM2: 31.89, usage: '거실', facility: 'OFFICE', shortSideM: 3.98, longSideM: 8.02 }),
  polygon: Polygon.rect(24, 24, 272, 135),
}
const 침실 = {
  room: Room.create({ id: 'AC_002', floor: '지상1층', name: '침실1', areaM2: 18.5, usage: '침실', facility: 'OFFICE', shortSideM: 3.98, longSideM: 4.65 }),
  polygon: Polygon.rect(296, 24, 158, 135),
}
const 회의실 = {
  room: Room.create({ id: 'AC_003', floor: '지상1층', name: '회의실', areaM2: 28.5, usage: '회의실', facility: 'OFFICE', shortSideM: 3.99, longSideM: 7.15 }),
  polygon: Polygon.rect(454, 24, 242, 135),
}

describe('mergeRooms — 인접한 두 실을 하나로', () => {
  it('면적은 두 실의 합이다(면적 합 보존)', () => {
    const m = mergeRooms(거실, 침실)
    expect(m.room.areaM2).toBeCloseTo(31.89 + 18.5, 6)
  })

  it('형상은 두 실의 합집합이다', () => {
    const m = mergeRooms(거실, 침실)
    expect(m.polygon.area).toBeCloseTo(거실.polygon.area + 침실.polygon.area, 6)
    expect(m.polygon.bbox).toEqual({ x: 24, y: 24, w: 430, h: 135 })
  })

  it('용도는 면적이 큰 실을 승계하고, 부하가 얼마나 바뀌는지 알려준다', () => {
    const m = mergeRooms(거실, 침실)
    expect(m.room.usage).toBe('거실') // 31.89 > 18.5
    expect(m.usageChanged).toBe(true) // 침실1의 용도는 버려졌다
    // 목업은 두 용도의 단위부하가 같아(150kcal 기본) 부하 합이 유지된다
    expect(m.loadDeltaW).toBeCloseTo(0, 6)
  })

  it('용도가 같으면 부하 합이 정확히 보존되고 usageChanged는 false다', () => {
    const a = { ...거실, room: 거실.room.withUsage('사무실') }
    const b = { ...침실, room: 침실.room.withUsage('사무실') }
    const m = mergeRooms(a, b)
    expect(m.usageChanged).toBe(false)
    expect(m.room.requiredLoadW.cool).toBeCloseTo(a.room.requiredLoadW.cool + b.room.requiredLoadW.cool, 6)
  })

  it('단위부하가 다른 용도끼리 합치면 부하 합계가 바뀐다(사실을 숫자로 준다)', () => {
    const 식당 = { ...침실, room: 침실.room.overrideUnitLoad(new UnitLoad(300, 320)) }
    const before = 거실.room.requiredLoadW.cool + 식당.room.requiredLoadW.cool
    const m = mergeRooms(거실, 식당)
    expect(m.room.requiredLoadW.cool).not.toBeCloseTo(before, 1)
    expect(m.loadDeltaW).toBeCloseTo(m.room.requiredLoadW.cool - before, 6)
  })

  it('단변·장변은 합집합 형상에서 새로 뽑는다', () => {
    const m = mergeRooms(거실, 침실)
    // 430×135px, 50.39㎡ → 축척 √(50.39/58050) ≈ 0.02947 → 12.67m × 3.98m
    expect(m.room.shortSideM).toBeCloseTo(3.98, 1)
    expect(m.room.longSideM).toBeCloseTo(12.67, 1)
    expect(indoorTypeFor({ ...m.room.shape, requiredCoolW: m.room.requiredLoadW.cool })).toBe('4WAY')
  })

  it('층은 같아야 한다(실외기 버킷이 층 × 계열이다)', () => {
    const 이층 = { ...침실, room: Room.create({ ...침실.room, id: 'AC_009', floor: '지상2층', name: '침실2', areaM2: 18.5, usage: '침실', facility: 'OFFICE', shortSideM: 3.98, longSideM: 4.65 }) }
    expect(() => mergeRooms(거실, 이층)).toThrow(MergeFloorMismatchError)
  })

  it('붙어 있지 않은 실은 합칠 수 없다', () => {
    expect(() => mergeRooms(거실, 회의실)).toThrow(NotAdjacentError)
  })
})

describe('mergeRooms — id·이름 규칙', () => {
  it('형제(자른 조각)를 다시 합치면 부모가 복원된다', () => {
    const [a, b] = sliceRoom(거실.room, 거실.polygon, { x: 160, y: 91, angleDeg: 90 })
    expect(a.room.id).toBe('AC_001-1')

    const m = mergeRooms(a, b)
    expect(m.room.id).toBe('AC_001') // 부모 복원
    expect(m.room.name).toBe('거실')
    expect(m.room.areaM2).toBeCloseTo(31.89, 6)
    expect(m.polygon.area).toBeCloseTo(거실.polygon.area, 6)
  })

  it('남남인 두 실을 합치면 앞선 id를 쓰고 이름은 합성한다', () => {
    const m = mergeRooms(거실, 침실)
    expect(m.room.id).toBe('AC_001')
    expect(m.room.name).toBe('거실+침실1')
  })

  it('세 조각으로 자른 뒤 둘만 합치면 부모가 아니라 합성 이름이 된다', () => {
    const [a, b] = sliceRoom(거실.room, 거실.polygon, { x: 120, y: 91, angleDeg: 90 })
    const [b1, b2] = sliceRoom(b.room, b.polygon, { x: 220, y: 91, angleDeg: 90 })
    // a(AC_001-1) + b1(AC_001-2-1)은 형제가 아니다
    const m = mergeRooms(a, b1)
    expect(m.room.id).toBe('AC_001-1')
    expect(m.room.name).toBe('거실-1+거실-2-1')
    expect(b2.room.id).toBe('AC_001-2-2') // 나머지는 그대로
  })
})

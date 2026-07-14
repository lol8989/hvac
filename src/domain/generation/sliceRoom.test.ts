import { describe, it, expect } from 'vitest'
import { Room } from './Room'
import { Polygon } from '../shared/Polygon'
import { UnitLoad } from '../shared/UnitLoad'
import { sliceRoom, TooThinSliceError, SliceMissedRoomError, MIN_SLICE_RATIO } from './sliceRoom'
import { indoorTypeFor } from './placementRules'

// 목업 '거실'과 같은 축척: 픽셀 250×150 = 31.89㎡ (data.ts:60)
const parentPoly = Polygon.rect(24, 24, 250, 150)
const parent = Room.create({
  id: 'AC_001',
  floor: '지상1층',
  name: '거실',
  areaM2: 31.89,
  usage: '거실',
  facility: 'OFFICE',
  shortSideM: 4.37,
  longSideM: 7.29,
})

// 세로선(90°)으로 가운데를 자른다 → 좌우 두 조각
const CENTER_V = { x: 24 + 125, y: 24 + 75, angleDeg: 90 }

describe('sliceRoom — 실 하나를 둘로', () => {
  it('두 자식의 면적 합은 부모 면적과 같다(면적 합 보존)', () => {
    const [a, b] = sliceRoom(parent, parentPoly, CENTER_V)
    expect(a.room.areaM2 + b.room.areaM2).toBeCloseTo(parent.areaM2, 6)
  })

  it('가운데를 자르면 면적이 절반씩 나뉜다', () => {
    const [a, b] = sliceRoom(parent, parentPoly, CENTER_V)
    expect(a.room.areaM2).toBeCloseTo(31.89 / 2, 6)
    expect(b.room.areaM2).toBeCloseTo(31.89 / 2, 6)
  })

  it('자식 id는 부모에서 파생되고 실내기 id 규약을 깨는 #을 쓰지 않는다', () => {
    const [a, b] = sliceRoom(parent, parentPoly, CENTER_V)
    expect(a.room.id).toBe('AC_001-1')
    expect(b.room.id).toBe('AC_001-2')
    expect(a.room.id).not.toContain('#')
  })

  it('자식 이름도 부모에서 파생된다', () => {
    const [a, b] = sliceRoom(parent, parentPoly, CENTER_V)
    expect(a.room.name).toBe('거실-1')
    expect(b.room.name).toBe('거실-2')
  })

  it('층·용도·시설군은 부모에서 상속한다(실외기 버킷이 층 × 계열이다)', () => {
    const [a] = sliceRoom(parent, parentPoly, CENTER_V)
    expect(a.room.floor).toBe('지상1층')
    expect(a.room.usage).toBe('거실')
    expect(a.room.facility).toBe('OFFICE')
  })

  it('자식의 단변·장변은 자식 폴리곤에서 새로 나온다(부모 값을 물려받지 않는다)', () => {
    const [a] = sliceRoom(parent, parentPoly, CENTER_V)
    // 부모 250×150px = 4.37×7.29m → 세로로 반 자르면 125×150px
    expect(a.room.shortSideM).not.toBeCloseTo(parent.shortSideM, 2)
    expect(a.room.shortSideM).toBeCloseTo(3.645, 2) // 125px × 축척
    expect(a.room.longSideM).toBeCloseTo(4.374, 2) // 150px × 축척
  })

  // 이 테스트가 "자식 치수를 새로 뽑는다"의 존재 이유다.
  // 부모 값을 물려주면(Room.withArea) 좁아진 자식이 계속 4WAY로 나온다.
  it('4WAY였던 실을 좁게 자르면 자식은 폭 규칙에 따라 2WAY가 된다', () => {
    // 부하 4kW 미만인 실을 쓴다 — 4kW 이상이면 무조건 4WAY라 형상 규칙이 가려진다.
    const wide = Room.create({
      id: 'AC_009', floor: '지상1층', name: '창고', areaM2: 20, usage: '창고',
      facility: 'OFFICE', shortSideM: 4.0, longSideM: 5.0,
    })
    const shapeOf = (r: Room) => ({ ...r.shape, requiredCoolW: r.requiredLoadW.cool })
    expect(indoorTypeFor(shapeOf(wide))).toBe('4WAY') // 폭 4.0m 확보 → 4WAY

    const poly = Polygon.rect(0, 0, 400, 500) // 축척 = √(20 / 200000) = 0.01 m/px
    const [a, b] = sliceRoom(wide, poly, { x: 100, y: 250, angleDeg: 90 }) // 100px | 300px

    expect(a.room.shortSideM).toBeCloseTo(1.0, 3) // 100px × 0.01
    expect(b.room.shortSideM).toBeCloseTo(3.0, 3) // 300px × 0.01
    expect(indoorTypeFor(shapeOf(a.room))).toBe('2WAY') // 좁고(≤3m) 긴(>4m) 방
    expect(indoorTypeFor(shapeOf(b.room))).toBe('2WAY')
  })

  it('부모의 단위부하 사용자 오버라이드는 자식에 승계된다', () => {
    const overridden = parent.overrideUnitLoad(new UnitLoad(200, 220))
    const [a] = sliceRoom(overridden, parentPoly, CENTER_V)
    expect(a.room.isUnitLoadOverridden).toBe(true)
    expect(a.room.effectiveUnitLoad.coolKcal).toBe(200)
  })

  it('오버라이드가 없으면 자식도 오버라이드가 없다', () => {
    const [a] = sliceRoom(parent, parentPoly, CENTER_V)
    expect(a.room.isUnitLoadOverridden).toBe(false)
  })

  it('자식 폴리곤의 넓이 합은 부모 폴리곤과 같다', () => {
    const [a, b] = sliceRoom(parent, parentPoly, { x: 100, y: 80, angleDeg: 30 })
    expect(a.polygon.area + b.polygon.area).toBeCloseTo(parentPoly.area, 6)
  })
})

describe('sliceRoom — 거부되는 절단', () => {
  it('선이 실을 지나지 않으면 자르지 않는다', () => {
    expect(() => sliceRoom(parent, parentPoly, { x: 5000, y: 5000, angleDeg: 0 })).toThrow(SliceMissedRoomError)
  })

  it(`조각이 부모의 ${MIN_SLICE_RATIO * 100}% 미만이면 자르지 않는다(면적 0 실 방지)`, () => {
    // 좌변에서 1px 떨어진 세로선 → 왼쪽 조각은 부모의 0.4%
    expect(() => sliceRoom(parent, parentPoly, { x: 25, y: 80, angleDeg: 90 })).toThrow(TooThinSliceError)
  })

  // 상대비(2%)만으로는 부족하다 — 절대 면적·단변 하한도 넘어야 실이 된다(적대적 QA).
  it('상대비는 넘겨도 폭이 0.5m 미만이면 자르지 않는다', () => {
    const poly = Polygon.rect(0, 0, 100, 100)
    const room = Room.create({
      id: 'AC_010', floor: '지상1층', name: '방', areaM2: 100, usage: '사무실',
      facility: 'OFFICE', shortSideM: 10, longSideM: 10,
    })
    // 2.5% 조각 = 폭 0.25m → 실이 아니다
    expect(() => sliceRoom(room, poly, { x: 2.5, y: 50, angleDeg: 90 })).toThrow(TooThinSliceError)
    // 10% 조각 = 폭 1.0m · 면적 10㎡ → 실이 된다
    expect(() => sliceRoom(room, poly, { x: 10, y: 50, angleDeg: 90 })).not.toThrow()
  })
})

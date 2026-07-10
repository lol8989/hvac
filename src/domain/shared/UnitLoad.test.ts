// UnitLoad 값객체 테스트 (TDD Red → Green)
import { describe, it, expect } from 'vitest'
import { UnitLoad, KCAL_TO_W, unitLoadForUsage } from './UnitLoad'

describe('UnitLoad 생성자 자기검증', () => {
  it('coolKcal이 0이면 throw한다', () => {
    expect(() => new UnitLoad(0, 150)).toThrow()
  })

  it('coolKcal이 음수이면 throw한다', () => {
    expect(() => new UnitLoad(-10, 150)).toThrow()
  })

  it('heatKcal이 0 이하이면 throw한다', () => {
    expect(() => new UnitLoad(150, 0)).toThrow()
    expect(() => new UnitLoad(150, -1)).toThrow()
  })

  it('NaN이면 throw한다', () => {
    expect(() => new UnitLoad(NaN, 150)).toThrow()
    expect(() => new UnitLoad(150, NaN)).toThrow()
  })

  it('Infinity이면 throw한다', () => {
    expect(() => new UnitLoad(Infinity, 150)).toThrow()
    expect(() => new UnitLoad(150, Infinity)).toThrow()
  })

  it('생성되면 불변(freeze)이다', () => {
    const u = new UnitLoad(170, 170)
    expect(Object.isFrozen(u)).toBe(true)
  })
})

describe('UnitLoad W 변환 (×1.163)', () => {
  it('KCAL_TO_W는 1.163이다', () => {
    expect(KCAL_TO_W).toBe(1.163)
  })

  it('시청각실(140 kcal/h·㎡)의 coolW는 약 162.82이다', () => {
    const u = new UnitLoad(140, 140)
    expect(u.coolW).toBeCloseTo(162.82, 2)
    expect(u.heatW).toBeCloseTo(162.82, 2)
  })
})

describe('UnitLoad.requiredLoadW 필요부하량', () => {
  it('시청각실 140 kcal × 20㎡ 이면 cool ≈ 3256.4 W이다', () => {
    const u = new UnitLoad(140, 140)
    const r = u.requiredLoadW(20)
    expect(r.cool).toBeCloseTo(3256.4, 1)
    expect(r.heat).toBeCloseTo(3256.4, 1)
  })

  it('면적이 0 이하이면 throw한다', () => {
    const u = new UnitLoad(170, 170)
    expect(() => u.requiredLoadW(0)).toThrow()
    expect(() => u.requiredLoadW(-5)).toThrow()
  })

  it('면적이 NaN/Infinity이면 throw한다', () => {
    const u = new UnitLoad(170, 170)
    expect(() => u.requiredLoadW(NaN)).toThrow()
    expect(() => u.requiredLoadW(Infinity)).toThrow()
  })
})

// 단위부하는 시설군·용도·부하강도로 정해진다(LG전자 단위부하 참고자료).
// 난방 자료가 없어 냉방값을 그대로 쓴다.
describe('unitLoadForUsage — 시설군·용도별 기본값', () => {
  it('시설군에 따라 같은 실명도 값이 다르다', () => {
    expect(unitLoadForUsage('주거시설', '식당').coolKcal).toBe(120)
    expect(unitLoadForUsage('상업시설', '식당').coolKcal).toBe(210)
  })

  it('냉방값을 난방값으로 그대로 쓴다(난방 부하표 미제공)', () => {
    const u = unitLoadForUsage('OFFICE', '사무실')
    expect(u.coolKcal).toBe(150)
    expect(u.heatKcal).toBe(150)
  })

  it('부하강도를 주면 해당 열을 쓴다', () => {
    expect(unitLoadForUsage('OFFICE', '사무실', 'HIGH').coolKcal).toBe(170)
    expect(unitLoadForUsage('OFFICE', '사무실', 'SPECIAL').coolKcal).toBe(200)
  })

  it('표에 없는 용도는 기본값 150을 반환한다', () => {
    const u = unitLoadForUsage('OFFICE', '시청각실')
    expect(u.coolKcal).toBe(150)
    expect(u.heatKcal).toBe(150)
  })

  it('동의어는 표준 실명으로 흡수된다(창고 → 관리실)', () => {
    expect(unitLoadForUsage('OFFICE', '창고').coolKcal).toBe(150)
  })
})

describe('UnitLoad.equals 동등성', () => {
  it('cool/heat이 같으면 true이다', () => {
    expect(new UnitLoad(170, 150).equals(new UnitLoad(170, 150))).toBe(true)
  })

  it('값이 다르면 false이다', () => {
    expect(new UnitLoad(170, 150).equals(new UnitLoad(170, 170))).toBe(false)
    expect(new UnitLoad(150, 150).equals(new UnitLoad(170, 150))).toBe(false)
  })
})

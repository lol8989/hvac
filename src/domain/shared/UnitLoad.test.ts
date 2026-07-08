// UnitLoad 값객체 테스트 (TDD Red → Green)
import { describe, it, expect } from 'vitest'
import { UnitLoad, KCAL_TO_W, DEFAULT_UNIT_LOADS, unitLoadForUsage } from './UnitLoad'

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

describe('unitLoadForUsage 용도별 기본값', () => {
  it('등록된 용도(사무실)는 시드 값(180)을 반환한다', () => {
    const u = unitLoadForUsage('사무실')
    expect(u.coolKcal).toBe(180)
    expect(u.heatKcal).toBe(180)
  })

  it('시청각실은 140을 반환한다', () => {
    expect(unitLoadForUsage('시청각실').coolKcal).toBe(140)
  })

  it('미등록 용도는 기본값 170을 반환한다', () => {
    const u = unitLoadForUsage('창고')
    expect(u.coolKcal).toBe(170)
    expect(u.heatKcal).toBe(170)
  })

  it('DEFAULT_UNIT_LOADS는 13개 용도를 포함한다', () => {
    expect(Object.keys(DEFAULT_UNIT_LOADS)).toHaveLength(13)
    expect(DEFAULT_UNIT_LOADS['거실']).toEqual({ cool: 170, heat: 170 })
    expect(DEFAULT_UNIT_LOADS['침실']).toEqual({ cool: 150, heat: 150 })
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

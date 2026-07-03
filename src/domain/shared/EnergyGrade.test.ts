import { describe, it, expect } from 'vitest'
import { EnergyGrade } from './EnergyGrade'

describe('EnergyGrade (에너지소비효율등급 값객체, 1~5)', () => {
  it('1~5 등급으로 생성되고 label을 만든다', () => {
    expect(new EnergyGrade(3).value).toBe(3)
    expect(new EnergyGrade(3).label()).toBe('3등급')
  })

  it('copCooling(효율비)을 선택 보유하고 eerLabel로 표시한다', () => {
    const g = new EnergyGrade(3, 4.99)
    expect(g.copCooling).toBe(4.99)
    expect(g.eerLabel()).toBe('4.99')
  })

  it('copCooling이 없으면 eerLabel은 null', () => {
    expect(new EnergyGrade(3).eerLabel()).toBeNull()
  })

  it('숫자가 작을수록 우수 — 1등급은 3등급보다 낫다', () => {
    expect(new EnergyGrade(1).isBetterThan(new EnergyGrade(3))).toBe(true)
    expect(new EnergyGrade(3).isBetterThan(new EnergyGrade(1))).toBe(false)
  })

  it('compare는 정렬용 부호를 반환한다', () => {
    expect(new EnergyGrade(1).compare(new EnergyGrade(3))).toBeLessThan(0)
  })

  it('equals는 등급·copCooling 기준', () => {
    expect(new EnergyGrade(3, 4.99).equals(new EnergyGrade(3, 4.99))).toBe(true)
    expect(new EnergyGrade(3).equals(new EnergyGrade(2))).toBe(false)
  })

  it('fromSpec은 efficiencyGradeId가 null이면 null을 반환한다', () => {
    expect(EnergyGrade.fromSpec({ efficiencyGradeId: null, copCooling: 4.0 })).toBeNull()
    expect(EnergyGrade.fromSpec({ efficiencyGradeId: 3, copCooling: 4.99 })).toBeInstanceOf(EnergyGrade)
  })

  // ─── 적대적 QA ───
  it('[적대] 1~5 밖(0/6/2.5/NaN)이면 예외', () => {
    expect(() => new EnergyGrade(0)).toThrow()
    expect(() => new EnergyGrade(6)).toThrow()
    expect(() => new EnergyGrade(2.5)).toThrow()
    expect(() => new EnergyGrade(NaN)).toThrow()
  })

  it('[적대] copCooling이 0 이하·100 초과·비유한이면 예외', () => {
    expect(() => new EnergyGrade(3, 0)).toThrow()
    expect(() => new EnergyGrade(3, 100)).toThrow()
    expect(() => new EnergyGrade(3, Infinity)).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const g = new EnergyGrade(3)
    expect(() => {
      // @ts-expect-error 불변(freeze) 위반은 런타임에서 차단
      g.value = 1
    }).toThrow()
  })
})

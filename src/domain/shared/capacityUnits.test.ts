import { describe, it, expect } from 'vitest'
import { wToKw, roundKw, kwToW } from './capacityUnits'

describe('capacityUnits — W↔kW 변환', () => {
  it('wToKw는 정확 변환(반올림 없음)', () => {
    expect(wToKw(3255.8)).toBeCloseTo(3.2558, 6)
    expect(wToKw(5600)).toBe(5.6)
  })

  it('roundKw는 0.1kW로 반올림(표시용)', () => {
    expect(roundKw(1206)).toBe(1.2)
    expect(roundKw(3255.8)).toBe(3.3) // 3.2558 → 3.3
    expect(roundKw(5600)).toBe(5.6)
  })

  it('kwToW는 정수 W(부동소수 오차 제거)', () => {
    expect(kwToW(5.6)).toBe(5600)
    expect(kwToW(34.8)).toBe(34800)
    expect(kwToW(0.1 + 0.2)).toBe(300) // 0.30000000000000004 → 300
  })
})

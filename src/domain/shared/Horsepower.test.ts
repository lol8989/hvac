// 마력 환산식 — Confluence 0708 회의 확정값. 근거: doc/05_설계결정/마력_환산식_적용_검토.md
import { describe, it, expect } from 'vitest'
import { HP_TO_KCAL_H, HP_TO_W, horsepowerFromCapacityW } from './Horsepower'

describe('마력 환산 상수', () => {
  it('1마력 = 2500 kcal/h', () => {
    expect(HP_TO_KCAL_H).toBe(2500)
  })

  it('1마력 = 2500 ÷ 0.86 ≈ 2906.98 W', () => {
    expect(HP_TO_W).toBeCloseTo(2906.98, 2)
  })
})

describe('horsepowerFromCapacityW (냉방용량 → 추정 마력)', () => {
  it('환산식 그대로 반올림한다', () => {
    expect(horsepowerFromCapacityW(HP_TO_W)).toBe(1)
    expect(horsepowerFromCapacityW(HP_TO_W * 2)).toBe(2)
    expect(horsepowerFromCapacityW(302400)).toBe(104) // RP-W1041X9H 실측 302.4kW
    expect(horsepowerFromCapacityW(65000)).toBe(22) // ACAH020LET2 공랭식 칠러 65kW
  })

  it('반올림 경계는 위로 올린다 (2.5 → 3)', () => {
    expect(horsepowerFromCapacityW(HP_TO_W * 2.5)).toBe(3)
    expect(horsepowerFromCapacityW(HP_TO_W * 2.49)).toBe(2)
  })

  // 1HP 미만 소용량 CDU(LSC-G0100F2, 1kW)는 반올림하면 0HP가 되어 게시가 막힌다.
  // 클램프해 1HP로 부풀리지 않고 실제 소수값을 보존한다(주인님 지시 2026-07-10).
  it('1HP 미만은 소수 둘째 자리까지 보존한다', () => {
    expect(horsepowerFromCapacityW(1000)).toBe(0.34) // 1000 ÷ 2906.98 = 0.344
    expect(horsepowerFromCapacityW(2000)).toBe(0.69)
  })

  it('1HP 이상은 정수로 반올림한다', () => {
    expect(horsepowerFromCapacityW(HP_TO_W * 1.4)).toBe(1)
  })

  it('소수 둘째 자리에서도 0이면 null (용량이 지나치게 작다)', () => {
    expect(horsepowerFromCapacityW(1)).toBeNull()
  })

  it('용량이 없거나 유효하지 않으면 null', () => {
    expect(horsepowerFromCapacityW(null)).toBeNull()
    expect(horsepowerFromCapacityW(0)).toBeNull()
    expect(horsepowerFromCapacityW(-5000)).toBeNull()
    expect(horsepowerFromCapacityW(Number.NaN)).toBeNull()
    expect(horsepowerFromCapacityW(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

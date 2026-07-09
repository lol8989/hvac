import { describe, it, expect } from 'vitest'
import { EnergySource } from './EnergySource'

describe('EnergySource (계열 값객체)', () => {
  it('허용 계열(EHP/GHP/AWHP/수냉식/Chiller/CDU/ERV)로 생성된다', () => {
    for (const code of ['EHP', 'GHP', 'AWHP', '수냉식', 'Chiller', 'CDU', 'ERV']) {
      expect(new EnergySource(code).code).toBe(code)
    }
  })

  it('같은 계열끼리 equals=true', () => {
    expect(new EnergySource('EHP').equals(new EnergySource('EHP'))).toBe(true)
  })

  it('교차 계열은 equals=false — EHP↔GHP 호환 불가', () => {
    expect(new EnergySource('EHP').equals(new EnergySource('GHP'))).toBe(false)
  })

  // ─── 적대적 QA ───
  it('[적대] 알 수 없는 계열이면 예외', () => {
    expect(() => new EnergySource('XHP')).toThrow()
    expect(() => new EnergySource('')).toThrow()
  })

  it('[적대] 문자열이 아니면 예외', () => {
    // @ts-expect-error 잘못된 타입 주입 — 런타임 가드 검증
    expect(() => new EnergySource(null)).toThrow()
    // @ts-expect-error 잘못된 타입 주입 — 런타임 가드 검증
    expect(() => new EnergySource(123)).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const s = new EnergySource('EHP')
    expect(() => {
      // @ts-expect-error 불변(freeze) 위반은 런타임에서 차단
      s.code = 'GHP'
    }).toThrow()
  })
})

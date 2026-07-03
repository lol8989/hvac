import { describe, it, expect } from 'vitest'
import { Capacity } from './Capacity.js'

describe('Capacity (용량 값객체, kW)', () => {
  it('kW 값으로 생성되고 kw 게터로 읽는다', () => {
    expect(new Capacity(34.8).kw).toBe(34.8)
  })

  it('plus()는 두 용량을 더한 새 Capacity를 반환한다', () => {
    const sum = new Capacity(11.2).plus(new Capacity(9.0))
    expect(sum.kw).toBeCloseTo(20.2, 5)
  })

  it('plus()는 원본을 변경하지 않는다(불변)', () => {
    const a = new Capacity(11.2)
    a.plus(new Capacity(9.0))
    expect(a.kw).toBe(11.2)
  })

  it('같은 kW끼리 equals=true', () => {
    expect(new Capacity(34.8).equals(new Capacity(34.8))).toBe(true)
  })

  // ─── 적대적 QA ───
  it('[적대] 0 이하이면 예외', () => {
    expect(() => new Capacity(0)).toThrow()
    expect(() => new Capacity(-5)).toThrow()
  })

  it('[적대] 숫자가 아니거나 NaN이면 예외', () => {
    expect(() => new Capacity('34.8')).toThrow()
    expect(() => new Capacity(NaN)).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const c = new Capacity(34.8)
    expect(() => {
      c.value = 999
    }).toThrow()
  })
})

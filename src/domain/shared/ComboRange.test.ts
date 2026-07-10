import { describe, it, expect } from 'vitest'
import { ComboRange } from './ComboRange'

describe('ComboRange (조합비 허용범위 값객체)', () => {
  it('min/max로 생성하면 그대로 노출한다', () => {
    const r = new ComboRange(0.3, 1.0)
    expect(r.min).toBe(0.3)
    expect(r.max).toBe(1.0)
  })

  it('DEFAULT는 (0.5, 1.03)이다 — Confluence 자동배치 룰 "허용 50%~103%"', () => {
    expect(ComboRange.DEFAULT.min).toBe(0.5)
    expect(ComboRange.DEFAULT.max).toBe(1.03)
  })

  it('contains: 경계값 min/max는 범위에 포함된다', () => {
    const r = new ComboRange(0.5, 1.3)
    expect(r.contains(0.5)).toBe(true)
    expect(r.contains(1.3)).toBe(true)
    expect(r.contains(0.49)).toBe(false)
    expect(r.contains(1.31)).toBe(false)
  })

  it('equals: 같은 min/max면 동등, 다르면 다르다', () => {
    expect(new ComboRange(0.5, 1.3).equals(new ComboRange(0.5, 1.3))).toBe(true)
    expect(new ComboRange(0.5, 1.3).equals(new ComboRange(0.3, 1.0))).toBe(false)
  })

  // ─── 적대적 QA: 자기검증·불변성 ───
  it('[적대] min ≥ max이면 예외', () => {
    expect(() => new ComboRange(1.3, 0.5)).toThrow()
    expect(() => new ComboRange(1.0, 1.0)).toThrow()
  })

  it('[적대] min이 0 이하이면 예외', () => {
    expect(() => new ComboRange(0, 1.3)).toThrow()
    expect(() => new ComboRange(-0.5, 1.3)).toThrow()
  })

  it('[적대] 유한수가 아니면(NaN/Infinity/문자열) 예외', () => {
    expect(() => new ComboRange(NaN, 1.3)).toThrow()
    expect(() => new ComboRange(0.5, Infinity)).toThrow()
    // @ts-expect-error 잘못된 타입 주입 — 런타임 가드 검증
    expect(() => new ComboRange('0.5', 1.3)).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const r = new ComboRange(0.5, 1.3)
    expect(() => {
      // @ts-expect-error 불변(freeze) 위반은 런타임에서 차단
      r.min = 0.1
    }).toThrow()
  })
})

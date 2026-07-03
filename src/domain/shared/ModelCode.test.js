import { describe, it, expect } from 'vitest'
import { ModelCode } from './ModelCode.js'

describe('ModelCode (모델식별 값객체)', () => {
  it('모델명 문자열로 생성되고 value로 읽는다', () => {
    expect(new ModelCode('RPUW12BX9M').value).toBe('RPUW12BX9M')
  })

  it('앞뒤 공백은 제거된다', () => {
    expect(new ModelCode('  GPUW280C2S  ').value).toBe('GPUW280C2S')
  })

  it('같은 모델코드끼리 equals=true, 다르면 false', () => {
    expect(new ModelCode('RPUW12BX9M').equals(new ModelCode('RPUW12BX9M'))).toBe(true)
    expect(new ModelCode('RPUW12BX9M').equals(new ModelCode('RPUW20BX9P'))).toBe(false)
  })

  // ─── 적대적 QA ───
  it('[적대] 빈 문자열/공백만 있으면 예외', () => {
    expect(() => new ModelCode('')).toThrow()
    expect(() => new ModelCode('   ')).toThrow()
  })

  it('[적대] 문자열이 아니면 예외', () => {
    expect(() => new ModelCode(null)).toThrow()
    expect(() => new ModelCode(123)).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const m = new ModelCode('RPUW12BX9M')
    expect(() => {
      m.value = 'X'
    }).toThrow()
  })
})

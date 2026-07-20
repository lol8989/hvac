// 등록/수정 입력의 자기검증. 적대적 입력(음수·NaN·Infinity·빈 문자열·잘못된 날짜)을 도메인에서 막는다.
import { describe, it, expect } from 'vitest'
import { assertValidDraft, assertValidPatch, type ProductDraft } from './ProductDraft'
import { EquipmentDomainError } from './errors'

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  seriesCode: 'S_IN_4WAY',
  modelCode: 'RNW0401C2S',
  horsepower: null,
  coolingW: 4000,
  heatingW: 4500,
  maxConnections: null,
  ...over,
})


const codeOf = (fn: () => void): string => {
  try {
    fn()
  } catch (e) {
    return (e as EquipmentDomainError).code
  }
  throw new Error('예외가 발생하지 않았다')
}

describe('assertValidDraft (제품 등록 입력)', () => {
  it('정상 입력은 통과한다', () => {
    expect(() => assertValidDraft(draft())).not.toThrow()
    expect(() => assertValidDraft(draft({ horsepower: 12, coolingW: 34800, heatingW: 39000, maxConnections: 20 }))).not.toThrow()
  })

  it('모델명이 비었거나 공백뿐이면 INVALID_FIELD', () => {
    expect(codeOf(() => assertValidDraft(draft({ modelCode: '' })))).toBe('INVALID_FIELD')
    expect(codeOf(() => assertValidDraft(draft({ modelCode: '   ' })))).toBe('INVALID_FIELD')
  })

  it('시리즈 코드가 비면 INVALID_FIELD', () => {
    expect(codeOf(() => assertValidDraft(draft({ seriesCode: '' })))).toBe('INVALID_FIELD')
  })

  it('음수 용량을 거부한다', () => {
    expect(codeOf(() => assertValidDraft(draft({ coolingW: -1 })))).toBe('INVALID_FIELD')
    expect(codeOf(() => assertValidDraft(draft({ heatingW: -1 })))).toBe('INVALID_FIELD')
  })

  it('NaN·Infinity 용량을 거부한다', () => {
    expect(codeOf(() => assertValidDraft(draft({ coolingW: NaN })))).toBe('INVALID_FIELD')
    expect(codeOf(() => assertValidDraft(draft({ coolingW: Infinity })))).toBe('INVALID_FIELD')
  })

  it('마력은 0 이하를 거부한다(양수 또는 null)', () => {
    expect(codeOf(() => assertValidDraft(draft({ horsepower: 0 })))).toBe('INVALID_FIELD')
    expect(codeOf(() => assertValidDraft(draft({ horsepower: -5 })))).toBe('INVALID_FIELD')
    expect(() => assertValidDraft(draft({ horsepower: null }))).not.toThrow()
  })

  it('최대 연결 실내기 수는 1 이상 정수만 허용한다', () => {
    expect(codeOf(() => assertValidDraft(draft({ maxConnections: 0 })))).toBe('INVALID_FIELD')
    expect(codeOf(() => assertValidDraft(draft({ maxConnections: 2.5 })))).toBe('INVALID_FIELD')
    expect(() => assertValidDraft(draft({ maxConnections: 1 }))).not.toThrow()
  })

  it('냉방·난방 용량이 모두 없으면 거부한다(스펙 없는 제품 방지)', () => {
    expect(codeOf(() => assertValidDraft(draft({ coolingW: null, heatingW: null })))).toBe('INVALID_FIELD')
  })
})

describe('assertValidPatch (제품 수정 입력)', () => {
  it('부분 수정: 지정한 필드만 검증한다', () => {
    expect(() => assertValidPatch({ coolingW: 5000 })).not.toThrow()
    expect(() => assertValidPatch({})).not.toThrow()
  })

  it('지정된 필드가 부적합하면 INVALID_FIELD', () => {
    expect(codeOf(() => assertValidPatch({ coolingW: -1 }))).toBe('INVALID_FIELD')
    expect(codeOf(() => assertValidPatch({ modelCode: ' ' }))).toBe('INVALID_FIELD')
  })

  it('용량 두 필드를 모두 null로 지우려 하면 거부한다', () => {
    expect(codeOf(() => assertValidPatch({ coolingW: null, heatingW: null }))).toBe('INVALID_FIELD')
  })
})


import { describe, it, expect } from 'vitest'
import { PUBLISH_STATUS, isPublished, canTransition, assertTransition, canEditSpec, assertSpecEditable } from './PublishStatus'
import { EquipmentDomainError } from './errors'

const { DRAFT, PUBLISHED, ARCHIVED } = PUBLISH_STATUS

describe('PublishStatus (게시 게이트)', () => {
  it('DRAFT/PUBLISHED/ARCHIVED 3상태를 정의한다', () => {
    expect(Object.values(PUBLISH_STATUS).sort()).toEqual(['ARCHIVED', 'DRAFT', 'PUBLISHED'])
  })

  it('isPublished는 PUBLISHED만 참, 나머지는 거짓(외부 노출 게이트)', () => {
    expect(isPublished(PUBLISHED)).toBe(true)
    expect(isPublished(DRAFT)).toBe(false)
    expect(isPublished(ARCHIVED)).toBe(false)
  })
})

// 허용 전이(주인님 결정 2026-07-09): 선형 + 재게시. PUBLISHED→DRAFT(게시 취소)는 금지 —
// 생성/검도가 참조하던 데이터가 소리 없이 사라지는 것을 막는다.
describe('canTransition (상태 전이 불변식)', () => {
  it('DRAFT에서 게시(PUBLISHED)·폐기(ARCHIVED)로 전이한다', () => {
    expect(canTransition(DRAFT, PUBLISHED)).toBe(true)
    expect(canTransition(DRAFT, ARCHIVED)).toBe(true)
  })

  it('PUBLISHED에서 보관(ARCHIVED)으로만 전이한다', () => {
    expect(canTransition(PUBLISHED, ARCHIVED)).toBe(true)
  })

  it('ARCHIVED에서 재게시(PUBLISHED)로 전이한다', () => {
    expect(canTransition(ARCHIVED, PUBLISHED)).toBe(true)
  })

  it('게시 취소(PUBLISHED→DRAFT)와 보관 해제(ARCHIVED→DRAFT)는 금지한다', () => {
    expect(canTransition(PUBLISHED, DRAFT)).toBe(false)
    expect(canTransition(ARCHIVED, DRAFT)).toBe(false)
  })

  it('같은 상태로의 전이는 금지한다(무의미한 명령)', () => {
    for (const s of Object.values(PUBLISH_STATUS)) expect(canTransition(s, s)).toBe(false)
  })

  it('assertTransition은 금지 전이에서 INVALID_TRANSITION 도메인 예외를 던진다', () => {
    expect(() => assertTransition(DRAFT, PUBLISHED)).not.toThrow()
    expect(() => assertTransition(PUBLISHED, DRAFT)).toThrow(EquipmentDomainError)
    try {
      assertTransition(PUBLISHED, DRAFT)
    } catch (e) {
      expect((e as EquipmentDomainError).code).toBe('INVALID_TRANSITION')
    }
  })
})

// 게시본 잠금(주인님 결정 2026-07-09): 스펙 수정은 DRAFT에서만. 단가는 이력 테이블이므로 별도 규칙.
describe('canEditSpec (게시본 스펙 잠금)', () => {
  it('DRAFT만 스펙 수정이 가능하다', () => {
    expect(canEditSpec(DRAFT)).toBe(true)
    expect(canEditSpec(PUBLISHED)).toBe(false)
    expect(canEditSpec(ARCHIVED)).toBe(false)
  })

  it('assertSpecEditable은 게시·보관본 수정 시 SPEC_LOCKED 도메인 예외를 던진다', () => {
    expect(() => assertSpecEditable(DRAFT)).not.toThrow()
    expect(() => assertSpecEditable(PUBLISHED)).toThrow(EquipmentDomainError)
    try {
      assertSpecEditable(ARCHIVED)
    } catch (e) {
      expect((e as EquipmentDomainError).code).toBe('SPEC_LOCKED')
    }
  })
})

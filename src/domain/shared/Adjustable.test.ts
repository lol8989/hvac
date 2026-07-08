// Adjustable<T> 테스트 — "AI 기본값 + 사용자 오버라이드" provenance 값 래퍼 (TDD Red 먼저).
import { describe, it, expect } from 'vitest'
import {
  adjustable,
  effective,
  isOverridden,
  withUser,
  clearUser,
  withAi,
} from './Adjustable'

describe('Adjustable', () => {
  describe('adjustable(ai)', () => {
    it('AI 값만 가진 래퍼를 생성하면 user는 없고 frozen이다', () => {
      const a = adjustable(42)
      expect(a.ai).toBe(42)
      expect('user' in a).toBe(false)
      expect(Object.isFrozen(a)).toBe(true)
    })
  })

  describe('effective', () => {
    it('user가 없으면 ai 값을 반환한다', () => {
      expect(effective(adjustable(10))).toBe(10)
    })

    it('user가 있으면 user 값을 우선 반환한다', () => {
      expect(effective(withUser(adjustable(10), 99))).toBe(99)
    })

    it('user가 0 같은 falsy 값이어도 오버라이드로 인정한다(!== undefined 판정)', () => {
      expect(effective(withUser(adjustable(10), 0))).toBe(0)
    })

    it('user가 빈 문자열이어도 오버라이드로 인정한다', () => {
      expect(effective(withUser(adjustable('ai'), ''))).toBe('')
    })
  })

  describe('isOverridden', () => {
    it('user가 없으면 false를 반환한다', () => {
      expect(isOverridden(adjustable(1))).toBe(false)
    })

    it('user가 설정되면 true를 반환한다', () => {
      expect(isOverridden(withUser(adjustable(1), 2))).toBe(true)
    })

    it('user가 falsy(0)여도 true를 반환한다', () => {
      expect(isOverridden(withUser(adjustable(1), 0))).toBe(true)
    })
  })

  describe('withUser', () => {
    it('오버라이드를 설정한 새 frozen 객체를 반환하고 원본은 변하지 않는다', () => {
      const base = adjustable(5)
      const next = withUser(base, 7)
      expect(next).not.toBe(base)
      expect(next.ai).toBe(5)
      expect(next.user).toBe(7)
      expect(Object.isFrozen(next)).toBe(true)
      // 원본 비파괴
      expect('user' in base).toBe(false)
      expect(effective(base)).toBe(5)
    })
  })

  describe('clearUser', () => {
    it('오버라이드를 해제하면 isOverridden이 false가 되고 ai로 되돌아간다', () => {
      const overridden = withUser(adjustable(3), 8)
      const cleared = clearUser(overridden)
      expect(isOverridden(cleared)).toBe(false)
      expect(effective(cleared)).toBe(3)
    })

    it('user 키 자체가 제거된다(값이 undefined인 키가 남지 않는다)', () => {
      const cleared = clearUser(withUser(adjustable(3), 8))
      expect('user' in cleared).toBe(false)
      expect(Object.isFrozen(cleared)).toBe(true)
    })

    it('원본 객체는 변하지 않는다', () => {
      const overridden = withUser(adjustable(3), 8)
      clearUser(overridden)
      expect(overridden.user).toBe(8)
    })
  })

  describe('withAi', () => {
    it('AI 값만 갱신하고 user 오버라이드는 보존한다(AI 재실행 시 수정 셀 보존)', () => {
      const overridden = withUser(adjustable(100), 55)
      const rerun = withAi(overridden, 120)
      expect(rerun.ai).toBe(120)
      expect(rerun.user).toBe(55)
      expect(effective(rerun)).toBe(55)
      expect(Object.isFrozen(rerun)).toBe(true)
    })

    it('user가 없으면 갱신된 ai가 effective가 된다', () => {
      const rerun = withAi(adjustable(100), 120)
      expect(effective(rerun)).toBe(120)
      expect('user' in rerun).toBe(false)
    })

    it('원본 객체는 변하지 않는다', () => {
      const base = withUser(adjustable(100), 55)
      withAi(base, 120)
      expect(base.ai).toBe(100)
      expect(base.user).toBe(55)
    })
  })
})

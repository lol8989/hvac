// Placement 단위 테스트 (Generation 컨텍스트).
// 실별 실내기 배치(모델+대수) — AI 기본 선정 + 사용자 오버라이드(수정 셀 보존) 정책 검증.

import { describe, it, expect } from 'vitest'
import { Placement } from './Placement'
import { IndoorModel } from './IndoorModel'
import type { IndoorSelection } from './IndoorModel'

const sel = (modelCode: string, quantity: number): IndoorSelection => ({ modelCode, quantity })

// 엑셀 실측 기준 모델: 40C — 냉방 4000W / 난방 4500W
const model40C = new IndoorModel({
  code: '40C',
  model: 'RNW0401C2S',
  coolW: 4000,
  heatW: 4500,
  type: '4WAY 카세트',
  energySource: 'EHP',
})

describe('Placement.ai (생성/검증)', () => {
  it('AI 최초 선정으로 생성하면 effectiveSelection이 AI값이고 오버라이드가 아니다', () => {
    const p = Placement.ai('room-1', sel('40C', 2))
    expect(p.roomId).toBe('room-1')
    expect(p.effectiveSelection).toEqual({ modelCode: '40C', quantity: 2 })
    expect(p.isOverridden).toBe(false)
  })

  it('roomId가 빈값이면 생성 시 에러를 던진다', () => {
    expect(() => Placement.ai('', sel('40C', 1))).toThrow()
    expect(() => Placement.ai('   ', sel('40C', 1))).toThrow()
  })

  it('modelCode가 빈값이면 에러를 던진다', () => {
    expect(() => Placement.ai('room-1', sel('', 1))).toThrow()
    expect(() => Placement.ai('room-1', sel('   ', 1))).toThrow()
  })

  it('quantity가 0/-1/1.5(1 미만 또는 비정수)이면 에러를 던진다', () => {
    expect(() => Placement.ai('room-1', sel('40C', 0))).toThrow()
    expect(() => Placement.ai('room-1', sel('40C', -1))).toThrow()
    expect(() => Placement.ai('room-1', sel('40C', 1.5))).toThrow()
  })
})

describe('Placement 오버라이드 (사용자 조정)', () => {
  it('overrideSelection하면 effectiveSelection이 사용자값으로 바뀌고 isOverridden이 true다', () => {
    const p = Placement.ai('room-1', sel('40C', 2)).overrideSelection(sel('60C', 3))
    expect(p.effectiveSelection).toEqual({ modelCode: '60C', quantity: 3 })
    expect(p.isOverridden).toBe(true)
  })

  it('overrideSelection에 잘못된 선정값(빈 modelCode, quantity 0)을 주면 에러를 던진다', () => {
    const p = Placement.ai('room-1', sel('40C', 2))
    expect(() => p.overrideSelection(sel('', 1))).toThrow()
    expect(() => p.overrideSelection(sel('60C', 0))).toThrow()
  })

  it('withAiSelection(AI 재선정)해도 사용자 오버라이드가 보존된다', () => {
    const p = Placement.ai('room-1', sel('40C', 2))
      .overrideSelection(sel('60C', 3))
      .withAiSelection(sel('80C', 1))
    expect(p.effectiveSelection).toEqual({ modelCode: '60C', quantity: 3 })
    expect(p.isOverridden).toBe(true)
  })

  it('오버라이드가 없으면 withAiSelection이 effectiveSelection을 새 AI값으로 바꾼다', () => {
    const p = Placement.ai('room-1', sel('40C', 2)).withAiSelection(sel('80C', 1))
    expect(p.effectiveSelection).toEqual({ modelCode: '80C', quantity: 1 })
    expect(p.isOverridden).toBe(false)
  })

  it('withAiSelection에 잘못된 선정값을 주면 에러를 던진다', () => {
    const p = Placement.ai('room-1', sel('40C', 2))
    expect(() => p.withAiSelection(sel('', 1))).toThrow()
    expect(() => p.withAiSelection(sel('80C', 1.5))).toThrow()
  })

  it('clearOverride하면 AI값으로 복귀한다 (AI 재선정된 최신 AI값)', () => {
    const p = Placement.ai('room-1', sel('40C', 2))
      .overrideSelection(sel('60C', 3))
      .withAiSelection(sel('80C', 1))
      .clearOverride()
    expect(p.effectiveSelection).toEqual({ modelCode: '80C', quantity: 1 })
    expect(p.isOverridden).toBe(false)
  })
})

describe('Placement.totals (용량 합산)', () => {
  it('40C(4000/4500) 3대이면 coolW 12000 / heatW 13500이다 (엑셀 실측)', () => {
    const p = Placement.ai('room-1', sel('40C', 3))
    expect(p.totals(model40C)).toEqual({ coolW: 12000, heatW: 13500 })
  })

  it('model.code가 effectiveSelection.modelCode와 다르면 에러를 던진다 (정합 보호)', () => {
    const p = Placement.ai('room-1', sel('60C', 2))
    expect(() => p.totals(model40C)).toThrow()
  })

  it('오버라이드된 selection 기준으로 totals를 계산한다', () => {
    const p = Placement.ai('room-1', sel('60C', 2)).overrideSelection(sel('40C', 2))
    expect(p.totals(model40C)).toEqual({ coolW: 8000, heatW: 9000 })
  })
})

describe('Placement 불변성/동등성', () => {
  it('인스턴스와 selection은 동결(frozen)되어 있고, 갱신 메서드는 새 인스턴스를 반환한다', () => {
    const p = Placement.ai('room-1', sel('40C', 2))
    expect(Object.isFrozen(p)).toBe(true)
    expect(Object.isFrozen(p.selection)).toBe(true)
    const q = p.overrideSelection(sel('60C', 3))
    expect(q).not.toBe(p)
    expect(p.effectiveSelection).toEqual({ modelCode: '40C', quantity: 2 }) // 원본 비파괴
  })

  it('equals는 roomId가 같으면 true, 다르면 false다', () => {
    const a = Placement.ai('room-1', sel('40C', 2))
    const b = Placement.ai('room-1', sel('60C', 5))
    const c = Placement.ai('room-2', sel('40C', 2))
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })
})

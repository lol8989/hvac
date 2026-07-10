// Placement 단위 테스트 (Generation 컨텍스트).
// 실별 실내기 배치(모델+대수+좌표) — AI 기본 선정 + 사용자 오버라이드(수정 셀 보존) 정책,
// 그리고 핵심 불변식 `positions.length === quantity` 검증.

import { describe, it, expect } from 'vitest'
import { Placement } from './Placement'
import { IndoorModel } from './IndoorModel'
import type { IndoorSelection } from './IndoorModel'
import type { UnitPosition } from './layoutPositions'

const sel = (modelCode: string, quantity: number): IndoorSelection => ({ modelCode, quantity })
// 대수 n에 맞는 더미 좌표(서로 다른 x)
const pos = (n: number): UnitPosition[] => Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, rot: 0 }))

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
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(p.roomId).toBe('room-1')
    expect(p.effectiveSelection).toEqual({ modelCode: '40C', quantity: 2 })
    expect(p.isOverridden).toBe(false)
    expect(p.quantity).toBe(2)
    expect(p.positions).toHaveLength(2)
  })

  it('roomId가 빈값이면 생성 시 에러를 던진다', () => {
    expect(() => Placement.ai('', sel('40C', 1), pos(1))).toThrow()
    expect(() => Placement.ai('   ', sel('40C', 1), pos(1))).toThrow()
  })

  it('modelCode가 빈값이면 에러를 던진다', () => {
    expect(() => Placement.ai('room-1', sel('', 1), pos(1))).toThrow()
    expect(() => Placement.ai('room-1', sel('   ', 1), pos(1))).toThrow()
  })

  it('quantity가 0/-1/1.5(1 미만 또는 비정수)이면 에러를 던진다', () => {
    expect(() => Placement.ai('room-1', sel('40C', 0), [])).toThrow()
    expect(() => Placement.ai('room-1', sel('40C', -1), [])).toThrow()
    expect(() => Placement.ai('room-1', sel('40C', 1.5), pos(2))).toThrow()
  })
})

describe('Placement 불변식: positions.length === quantity', () => {
  it('[적대] 좌표 개수가 대수와 다르면 생성할 수 없다', () => {
    expect(() => Placement.ai('room-1', sel('40C', 2), pos(1))).toThrow(/좌표 개수/)
    expect(() => Placement.ai('room-1', sel('40C', 2), pos(3))).toThrow(/좌표 개수/)
  })

  it('[적대] 좌표가 유한수가 아니면 에러', () => {
    expect(() => Placement.ai('room-1', sel('40C', 1), [{ x: NaN, y: 0, rot: 0 }])).toThrow()
    expect(() => Placement.ai('room-1', sel('40C', 1), [{ x: 0, y: Infinity, rot: 0 }])).toThrow()
  })

  it('[적대] 오버라이드 시에도 좌표 개수가 맞아야 한다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(() => p.overrideSelection(sel('60C', 3), pos(2))).toThrow(/좌표 개수/)
  })
})

describe('Placement 오버라이드 (사용자 조정)', () => {
  it('overrideSelection하면 effectiveSelection이 사용자값으로 바뀌고 isOverridden이 true다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2)).overrideSelection(sel('60C', 3), pos(3))
    expect(p.effectiveSelection).toEqual({ modelCode: '60C', quantity: 3 })
    expect(p.isOverridden).toBe(true)
    expect(p.quantity).toBe(3)
  })

  it('overrideSelection에 잘못된 선정값(빈 modelCode, quantity 0)을 주면 에러를 던진다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(() => p.overrideSelection(sel('', 1), pos(1))).toThrow()
    expect(() => p.overrideSelection(sel('60C', 0), [])).toThrow()
  })

  it('withAiSelection(AI 재선정)해도 사용자 오버라이드가 보존된다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
      .overrideSelection(sel('60C', 3), pos(3))
      .withAiSelection(sel('80C', 1), pos(1))
    expect(p.effectiveSelection).toEqual({ modelCode: '60C', quantity: 3 })
    expect(p.isOverridden).toBe(true)
  })

  it('오버라이드된 실은 AI 재선정이 좌표도 건드리지 않는다(사용자가 놓은 자리 유지)', () => {
    const mine: UnitPosition[] = [{ x: 111, y: 222, rot: 90 }]
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
      .overrideSelection(sel('60C', 1), mine)
      .withAiSelection(sel('80C', 3), pos(3))
    expect(p.positions).toEqual(mine)
  })

  it('오버라이드가 없으면 withAiSelection이 effectiveSelection과 좌표를 새 AI값으로 바꾼다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2)).withAiSelection(sel('80C', 1), pos(1))
    expect(p.effectiveSelection).toEqual({ modelCode: '80C', quantity: 1 })
    expect(p.isOverridden).toBe(false)
    expect(p.positions).toHaveLength(1)
  })

  it('withAiSelection에 잘못된 선정값을 주면 에러를 던진다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(() => p.withAiSelection(sel('', 1), pos(1))).toThrow()
    expect(() => p.withAiSelection(sel('80C', 1.5), pos(2))).toThrow()
  })

  it('clearOverride하면 AI값으로 복귀한다 (AI 재선정된 최신 AI값)', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
      .overrideSelection(sel('60C', 3), pos(3))
      .withAiSelection(sel('80C', 1), pos(1))
      .clearOverride(pos(1))
    expect(p.effectiveSelection).toEqual({ modelCode: '80C', quantity: 1 })
    expect(p.isOverridden).toBe(false)
    expect(p.positions).toHaveLength(1)
  })
})

describe('Placement 도면 편집 — 좌표만 (대수 불변)', () => {
  it('moveUnit은 그 심볼의 좌표만 바꾸고 오버라이드를 만들지 않는다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2)).moveUnit(1, 55, 66)
    expect(p.positions[1]).toEqual({ x: 55, y: 66, rot: 0 })
    expect(p.positions[0]).toEqual({ x: 0, y: 0, rot: 0 })
    expect(p.quantity).toBe(2)
    expect(p.isOverridden).toBe(false) // 위치는 대수·모델이 아니다
  })

  it('rotateUnit은 회전만 바꾼다', () => {
    const p = Placement.ai('room-1', sel('40C', 1), pos(1)).rotateUnit(0, 90)
    expect(p.positions[0].rot).toBe(90)
  })

  it('[적대] 범위를 벗어난 index는 에러', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(() => p.moveUnit(2, 0, 0)).toThrow(/범위/)
    expect(() => p.moveUnit(-1, 0, 0)).toThrow(/범위/)
    expect(() => p.rotateUnit(1.5, 0)).toThrow(/범위/)
  })
})

describe('Placement 도면 편집 — 대수가 바뀐다 (사용자 오버라이드)', () => {
  it('addUnit은 대수를 1 늘리고 오버라이드로 기록한다 (모델은 유지)', () => {
    const p = Placement.ai('room-1', sel('40C', 1), pos(1)).addUnit({ x: 9, y: 9, rot: 0 })
    expect(p.quantity).toBe(2)
    expect(p.effectiveSelection).toEqual({ modelCode: '40C', quantity: 2 })
    expect(p.isOverridden).toBe(true)
  })

  it('removeUnit은 대수를 1 줄이고 오버라이드로 기록한다', () => {
    const p = Placement.ai('room-1', sel('40C', 3), pos(3)).removeUnit(1)!
    expect(p.quantity).toBe(2)
    expect(p.effectiveSelection.quantity).toBe(2)
    expect(p.isOverridden).toBe(true)
    expect(p.positions.map((q) => q.x)).toEqual([0, 20]) // 가운데가 빠졌다
  })

  it('마지막 한 대를 지우면 null을 반환한다(그 실에 실내기가 없다)', () => {
    expect(Placement.ai('room-1', sel('40C', 1), pos(1)).removeUnit(0)).toBe(null)
  })

  it('추가·삭제 후에도 AI 재선정은 사용자 대수를 덮지 않는다', () => {
    const p = Placement.ai('room-1', sel('40C', 1), pos(1))
      .addUnit({ x: 9, y: 9, rot: 0 })
      .withAiSelection(sel('40C', 1), pos(1))
    expect(p.quantity).toBe(2)
  })

  it('[적대] 범위를 벗어난 index 삭제는 에러', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(() => p.removeUnit(5)).toThrow(/범위/)
  })
})

describe('Placement.totals (용량 합산)', () => {
  it('40C(4000/4500) 3대이면 coolW 12000 / heatW 13500이다 (엑셀 실측)', () => {
    const p = Placement.ai('room-1', sel('40C', 3), pos(3))
    expect(p.totals(model40C)).toEqual({ coolW: 12000, heatW: 13500 })
  })

  it('model.code가 effectiveSelection.modelCode와 다르면 에러를 던진다 (정합 보호)', () => {
    const p = Placement.ai('room-1', sel('60C', 2), pos(2))
    expect(() => p.totals(model40C)).toThrow()
  })

  it('오버라이드된 selection 기준으로 totals를 계산한다', () => {
    const p = Placement.ai('room-1', sel('60C', 2), pos(2)).overrideSelection(sel('40C', 2), pos(2))
    expect(p.totals(model40C)).toEqual({ coolW: 8000, heatW: 9000 })
  })

  it('도면에서 1대를 지우면 총용량도 줄어든다(대수 SSOT)', () => {
    const p = Placement.ai('room-1', sel('40C', 3), pos(3)).removeUnit(0)!
    expect(p.totals(model40C)).toEqual({ coolW: 8000, heatW: 9000 })
  })
})

describe('Placement 불변성/동등성', () => {
  it('인스턴스와 selection은 동결(frozen)되어 있고, 갱신 메서드는 새 인스턴스를 반환한다', () => {
    const p = Placement.ai('room-1', sel('40C', 2), pos(2))
    expect(Object.isFrozen(p)).toBe(true)
    expect(Object.isFrozen(p.selection)).toBe(true)
    expect(Object.isFrozen(p.positions)).toBe(true)
    const q = p.overrideSelection(sel('60C', 3), pos(3))
    expect(q).not.toBe(p)
    expect(p.effectiveSelection).toEqual({ modelCode: '40C', quantity: 2 }) // 원본 비파괴
  })

  it('equals는 roomId가 같으면 true, 다르면 false다', () => {
    const a = Placement.ai('room-1', sel('40C', 2), pos(2))
    const b = Placement.ai('room-1', sel('60C', 5), pos(5))
    const c = Placement.ai('room-2', sel('40C', 2), pos(2))
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })
})

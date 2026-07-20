// IndoorModel VO 단위테스트 (TDD Red → Green).
// 근거: 표준 260415 장비선정표 엑셀 — 40C(RNW0401C2S) 냉방 4000W, 시청각실 행 3대 = 12000W.

import { describe, it, expect } from 'vitest'
import { IndoorModel } from './IndoorModel'

const validProps = {
  model: 'RNW0401C2S',
  coolW: 4000,
  heatW: 4500,
  type: '4WAY 카세트',
  energySource: 'EHP' as const,
}

describe('IndoorModel', () => {
  describe('생성 검증', () => {
    it('유효한 props로 생성하면 readonly 필드를 전부 노출한다', () => {
      const m = new IndoorModel(validProps)
      expect(m.model).toBe('RNW0401C2S')
      expect(m.coolW).toBe(4000)
      expect(m.heatW).toBe(4500)
      expect(m.type).toBe('4WAY 카세트')
      expect(m.energySource).toBe('EHP')
    })

    it('생성된 인스턴스는 불변(frozen)이다', () => {
      const m = new IndoorModel(validProps)
      expect(Object.isFrozen(m)).toBe(true)
    })

    it('model이 빈값이면 throw한다', () => {
      expect(() => new IndoorModel({ ...validProps, model: '' })).toThrow()
      expect(() => new IndoorModel({ ...validProps, model: ' ' })).toThrow()
    })

    it('type이 빈값이면 throw한다', () => {
      expect(() => new IndoorModel({ ...validProps, type: '' })).toThrow()
      expect(() => new IndoorModel({ ...validProps, type: '  ' })).toThrow()
    })

    it('coolW가 0 이하이거나 유한수가 아니면 throw한다', () => {
      expect(() => new IndoorModel({ ...validProps, coolW: 0 })).toThrow()
      expect(() => new IndoorModel({ ...validProps, coolW: -100 })).toThrow()
      expect(() => new IndoorModel({ ...validProps, coolW: NaN })).toThrow()
      expect(() => new IndoorModel({ ...validProps, coolW: Infinity })).toThrow()
    })

    it('heatW가 0 이하이거나 유한수가 아니면 throw한다', () => {
      expect(() => new IndoorModel({ ...validProps, heatW: 0 })).toThrow()
      expect(() => new IndoorModel({ ...validProps, heatW: -1 })).toThrow()
      expect(() => new IndoorModel({ ...validProps, heatW: NaN })).toThrow()
      expect(() => new IndoorModel({ ...validProps, heatW: Infinity })).toThrow()
    })
  })

  describe('totalCoolW / totalHeatW', () => {
    it('40C 3대의 총 냉방용량은 12000W이다 (엑셀 시청각실 행 실측)', () => {
      const m = new IndoorModel(validProps)
      expect(m.totalCoolW(3)).toBe(12000)
    })

    it('40C 2대의 총 난방용량은 9000W이다', () => {
      const m = new IndoorModel(validProps)
      expect(m.totalHeatW(2)).toBe(9000)
    })

    it('quantity가 0이면 throw한다', () => {
      const m = new IndoorModel(validProps)
      expect(() => m.totalCoolW(0)).toThrow()
      expect(() => m.totalHeatW(0)).toThrow()
    })

    it('quantity가 음수이면 throw한다', () => {
      const m = new IndoorModel(validProps)
      expect(() => m.totalCoolW(-1)).toThrow()
      expect(() => m.totalHeatW(-2)).toThrow()
    })

    it('quantity가 소수이면 throw한다', () => {
      const m = new IndoorModel(validProps)
      expect(() => m.totalCoolW(1.5)).toThrow()
      expect(() => m.totalHeatW(2.7)).toThrow()
    })
  })

  // 장비번호는 마스터가 아니라 유형·냉방용량에서 파생한다(0708 회의록 규칙).
  describe('equipmentCode (파생)', () => {
    it('4WAY 4000W면 40T다', () => {
      expect(new IndoorModel(validProps).equipmentCode).toBe('40T')
    })

    it('규칙이 없는 유형이면 null이다', () => {
      expect(new IndoorModel({ ...validProps, type: '덕트(고정압)' }).equipmentCode).toBeNull()
    })
  })

  describe('equals', () => {
    it('모델코드가 같으면 스펙이 달라도 동등하다', () => {
      const a = new IndoorModel(validProps)
      const b = new IndoorModel({ ...validProps, coolW: 9999 })
      expect(a.equals(b)).toBe(true)
    })

    it('모델코드가 다르면 동등하지 않다', () => {
      const a = new IndoorModel(validProps)
      const b = new IndoorModel({ ...validProps, model: 'RNW0521A2U' })
      expect(a.equals(b)).toBe(false)
    })
  })
})

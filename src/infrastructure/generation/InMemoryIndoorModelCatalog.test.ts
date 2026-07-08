// InMemoryIndoorModelCatalog 어댑터 테스트 (TDD Red → Green).
// 시드 근거: 표준 260415 장비선정표 엑셀 Multi V Super 탭.

import { describe, it, expect } from 'vitest'
import { InMemoryIndoorModelCatalog } from './InMemoryIndoorModelCatalog'

describe('InMemoryIndoorModelCatalog', () => {
  const catalog = new InMemoryIndoorModelCatalog()

  describe('list', () => {
    it('시드 16종을 전부 반환한다', () => {
      expect(catalog.list()).toHaveLength(16)
    })

    it('전 모델의 계열은 EHP이다', () => {
      expect(catalog.list().every((m) => m.energySource === 'EHP')).toBe(true)
    })

    it('C시리즈 7종은 4WAY 카세트, T시리즈 9종은 덕트 타입이다', () => {
      const list = catalog.list()
      expect(list.filter((m) => m.type === '4WAY 카세트')).toHaveLength(7)
      expect(list.filter((m) => m.type === '덕트')).toHaveLength(9)
    })

    it('반환 목록은 불변이다 (push 시 throw)', () => {
      const list = catalog.list()
      expect(() => (list as unknown[]).push(null)).toThrow()
    })
  })

  describe('byCode', () => {
    it('40C를 조회하면 RNW0401C2S 냉방 4000W/난방 4500W를 반환한다', () => {
      const m = catalog.byCode('40C')
      expect(m).not.toBeNull()
      expect(m!.model).toBe('RNW0401C2S')
      expect(m!.coolW).toBe(4000)
      expect(m!.heatW).toBe(4500)
    })

    it('110T를 조회하면 RNW1101A2U 냉방 11000W/난방 12400W를 반환한다', () => {
      const m = catalog.byCode('110T')
      expect(m).not.toBeNull()
      expect(m!.model).toBe('RNW1101A2U')
      expect(m!.coolW).toBe(11000)
      expect(m!.heatW).toBe(12400)
    })

    it('존재하지 않는 code면 null을 반환한다', () => {
      expect(catalog.byCode('999X')).toBeNull()
    })
  })

  describe('byModel', () => {
    it('RNW0201C2S를 조회하면 20C 냉방 2000W/난방 2200W를 반환한다', () => {
      const m = catalog.byModel('RNW0201C2S')
      expect(m).not.toBeNull()
      expect(m!.code).toBe('20C')
      expect(m!.coolW).toBe(2000)
      expect(m!.heatW).toBe(2200)
    })

    it('존재하지 않는 model이면 null을 반환한다', () => {
      expect(catalog.byModel('NOPE0000')).toBeNull()
    })
  })
})

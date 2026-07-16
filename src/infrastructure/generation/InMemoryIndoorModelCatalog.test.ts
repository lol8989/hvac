// InMemoryIndoorModelCatalog 어댑터 테스트 (TDD Red → Green).
// 시드 근거: 표준 260415 장비선정표 엑셀 Multi V Super 탭.

import { describe, it, expect } from 'vitest'
import { InMemoryIndoorModelCatalog } from './InMemoryIndoorModelCatalog'
import type { EquipmentMaster } from '../../domain/equipment/EquipmentMaster'
import type { IndoorSpecFields, OutdoorSpecFields } from '../../domain/equipment/MasterRecord'

describe('InMemoryIndoorModelCatalog', () => {
  const catalog = new InMemoryIndoorModelCatalog()

  describe('list', () => {
    it('시드 19종을 전부 반환한다', () => {
      expect(catalog.list()).toHaveLength(19)
    })

    it('전 모델의 계열은 EHP이다', () => {
      expect(catalog.list().every((m) => m.energySource === 'EHP')).toBe(true)
    })

    // 유형 라벨은 장비번호 접미문자와 일치한다(1WAY=C · 2WAY=G · 4WAY=T). 2026-07-10 정정.
    // 자동배치 룰이 세 타입을 모두 고를 수 있으려면 카탈로그가 셋을 다 담아야 한다.
    it('C시리즈 7종은 1WAY, G시리즈 3종은 2WAY, T시리즈 9종은 4WAY 카세트다', () => {
      const list = catalog.list()
      expect(list.filter((m) => m.type === '1WAY 카세트')).toHaveLength(7)
      expect(list.filter((m) => m.type === '2WAY 카세트')).toHaveLength(3)
      expect(list.filter((m) => m.type === '4WAY 카세트')).toHaveLength(9)
    })

    it('반환 목록은 불변이다 (push 시 throw)', () => {
      const list = catalog.list()
      expect(() => (list as unknown[]).push(null)).toThrow()
    })

    // 현업 확인 2026-07-16: FCU는 물 기반이라 냉매식 실외기와 조합 불가 → 생성 실내기 풀에서 제외.
    it('FCU 실내기가 게시돼 있어도 생성 풀에서 뺀다', () => {
      const indoor = (over: Partial<IndoorSpecFields>): IndoorSpecFields => ({
        code: 'X', model: 'X', coolW: 5200, heatW: 6000, type: '4WAY 카세트', series: 'S', energySource: 'EHP', ...over,
      })
      const stubMaster: EquipmentMaster = {
        publishedIndoor: () => [
          indoor({ code: '52T', model: 'RNW0521M2S', type: '4WAY 카세트' }),
          indoor({ code: 'FCU08', model: 'WF1A008L2T4', type: 'FCU(팬코일 유닛)', series: 'FCU' }),
        ],
        publishedOutdoor: (): readonly OutdoorSpecFields[] => [],
      }
      const list = new InMemoryIndoorModelCatalog(stubMaster).list()
      expect(list.map((m) => m.code)).toEqual(['52T'])
      expect(list.some((m) => m.type.includes('FCU'))).toBe(false)
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

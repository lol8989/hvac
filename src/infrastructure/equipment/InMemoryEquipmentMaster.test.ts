// InMemoryEquipmentMaster — 장비마스터 SSOT 시드 + 게시 게이트 검증.
// 시드 근거: 표준 260415 장비선정표 엑셀(실내기 Multi V Super 탭, 실외기 스펙).
import { describe, it, expect } from 'vitest'
import { InMemoryEquipmentMaster } from './InMemoryEquipmentMaster'

describe('InMemoryEquipmentMaster (게시 SSOT + 게이트)', () => {
  const master = new InMemoryEquipmentMaster()

  describe('publishedIndoor', () => {
    const pub = master.publishedIndoor()

    it('게시(PUBLISHED) 실내기 16종을 반환한다', () => {
      expect(pub).toHaveLength(16)
    })

    it('전 모델 계열은 EHP이다', () => {
      expect(pub.every((m) => m.energySource === 'EHP')).toBe(true)
    })

    it('40C는 RNW0401C2S 냉방 4000W/난방 4500W이다', () => {
      const m = pub.find((x) => x.code === '40C')!
      expect(m.model).toBe('RNW0401C2S')
      expect(m.coolW).toBe(4000)
      expect(m.heatW).toBe(4500)
    })

    it('[게이트] 비게시(DRAFT) 실내기는 published에 포함되지 않는다', () => {
      expect(pub.some((m) => m.code === 'DRAFT99')).toBe(false)
    })
  })

  describe('publishedOutdoor', () => {
    const pub = master.publishedOutdoor()
    const byModel = (m: string) => pub.find((e) => e.model === m)

    it('게시(PUBLISHED) 실외기 7종을 반환한다', () => {
      expect(pub).toHaveLength(7)
    })

    it('난방용량(heatKw)·마력(hp)이 기재된다', () => {
      expect(byModel('RPUW08BX9E')).toMatchObject({ heatKw: 25.1, hp: 8 })
      expect(byModel('RPUW12BX9M')).toMatchObject({ heatKw: 39.0, hp: 12 })
      expect(byModel('RPUW16BX9M')).toMatchObject({ heatKw: 50.4, hp: 16 })
      expect(byModel('RPUW20BX9P')).toMatchObject({ heatKw: 63.8, hp: 20 })
      expect(byModel('GPUW280C2S')).toMatchObject({ heatKw: 31.4, hp: 10 })
      expect(byModel('GPUW450C2S')).toMatchObject({ heatKw: 50.4, hp: 16 })
    })

    it('냉방전용 모델은 heatKw가 null, 등급/VAT가 null이다', () => {
      const s = byModel('RPUQ141X9S')!
      expect(s.heatKw).toBeNull()
      expect(s.hp).toBe(14)
      expect(s.efficiencyGradeId).toBeNull()
      expect(s.priceWithVatKrw).toBeNull()
    })

    it('comboMin/Max는 정책 미확정으로 전부 미지정(기본 0.5~1.3 적용 대상)', () => {
      for (const e of pub) {
        expect(e.comboMin).toBeUndefined()
        expect(e.comboMax).toBeUndefined()
      }
    })

    it('[게이트] 비게시(ARCHIVED) 실외기는 published에 포함되지 않는다', () => {
      expect(pub.some((e) => e.model === 'RPUW-ARCHIVED')).toBe(false)
    })
  })
})

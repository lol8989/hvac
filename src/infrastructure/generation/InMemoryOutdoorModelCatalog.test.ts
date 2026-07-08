import { describe, it, expect } from 'vitest'
import { InMemoryOutdoorModelCatalog, toOutdoorModelSpec } from './InMemoryOutdoorModelCatalog'
import { ComboRange } from '../../domain/shared/ComboRange'
import type { OduCatalogEntry } from '../../data'

// 장비마스터(Equipment Master)가 게시(PUBLISHED)하는 실외기 모델 스펙 카탈로그의
// 인메모리 어댑터. 생성(Generation) 컨텍스트는 이 포트를 통해서만 마스터 스펙을 읽는다.
describe('InMemoryOutdoorModelCatalog (장비마스터 실외기 스펙 카탈로그 포트 어댑터)', () => {
  const catalog = new InMemoryOutdoorModelCatalog()

  it('list()는 실외기 스펙 목록을 반환하고 각 항목에 최대 연결 수(maxConnections)가 있다', () => {
    const specs = catalog.list()
    expect(specs.length).toBeGreaterThan(0)
    for (const s of specs) {
      expect(Number.isInteger(s.maxConnections)).toBe(true)
      expect(s.maxConnections).toBeGreaterThan(0)
    }
  })

  it('findByModel은 모델 스펙(계열·용량·최대 연결 수)을 반환한다', () => {
    const s = catalog.findByModel('RPUW12BX9M')
    expect(s).toMatchObject({ model: 'RPUW12BX9M', energySource: 'EHP', capacityKw: 34.8 })
    expect(s!.maxConnections).toBeGreaterThan(0)
  })

  it('스펙에 단가(prices)·에너지등급·COP를 매핑한다', () => {
    const s = catalog.findByModel('RPUW12BX9M')!
    expect(s.prices?.[0]).toMatchObject({ priceTypeCode: 'CONSUMER', priceKrw: 4120000 })
    expect(s.efficiencyGradeId).toBe(3)
    expect(s.copCooling).toBe(4.99)
  })

  it('냉방전용/미상 모델은 등급 null·VAT null로 매핑된다', () => {
    const s = catalog.findByModel('RPUQ141X9S')!
    expect(s.efficiencyGradeId).toBeNull()
    expect(s.prices?.[0].priceWithVatKrw).toBeNull()
  })

  it('스펙에 난방용량(heatKw)·마력(hp)을 매핑한다', () => {
    const s = catalog.findByModel('RPUW12BX9M')!
    expect(s.heatKw).toBe(39.0)
    expect(s.hp).toBe(12)
  })

  it('냉방전용 모델의 heatKw는 null이다', () => {
    const s = catalog.findByModel('RPUQ141X9S')!
    expect(s.heatKw).toBeNull()
    expect(s.hp).toBe(14)
  })

  it('comboMin/Max 미지정 엔트리는 기본 조합비 범위(0.5~1.3)로 매핑된다', () => {
    for (const s of catalog.list()) {
      expect(s.comboRange).toBeInstanceOf(ComboRange)
      expect(s.comboRange.equals(ComboRange.DEFAULT)).toBe(true)
    }
  })

  it('comboMin/Max가 기재된 엔트리는 제품군별 ComboRange로 매핑된다', () => {
    const entry: OduCatalogEntry = {
      model: 'DOAS-TEST', cat: 'DOAS', sys: 'EHP', cool: 30, maxConn: 10,
      priceKrw: 1000000, priceTypeCode: 'CONSUMER', priceWithVatKrw: null,
      effectiveStartDate: '2026-04-20', priority: 10,
      efficiencyGradeId: null, copCooling: null, copHeating: null,
      heatKw: null, hp: 10, comboMin: 0.32, comboMax: 1.0,
    }
    const spec = toOutdoorModelSpec(entry)
    expect(spec.comboRange.equals(new ComboRange(0.32, 1.0))).toBe(true)
  })

  it('[적대] 카탈로그에 없는 모델은 undefined', () => {
    expect(catalog.findByModel('NOPE')).toBeUndefined()
  })
})

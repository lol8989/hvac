import { describe, it, expect } from 'vitest'
import { InMemoryOutdoorModelCatalog } from './InMemoryOutdoorModelCatalog'

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

  it('[적대] 카탈로그에 없는 모델은 undefined', () => {
    expect(catalog.findByModel('NOPE')).toBeUndefined()
  })
})

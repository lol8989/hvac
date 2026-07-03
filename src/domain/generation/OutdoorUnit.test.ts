import { describe, it, expect } from 'vitest'
import { OutdoorUnit } from './OutdoorUnit'
import { Capacity } from '../shared/Capacity'
import { EnergySource } from '../shared/EnergySource'
import { ModelCode } from '../shared/ModelCode'

describe('OutdoorUnit (실외기 값객체)', () => {
  const make = (over = {}) =>
    new OutdoorUnit({
      model: 'RPUW12BX9M',
      category: '냉난방 절환형',
      sys: 'EHP',
      capacityKw: 34.8,
      maxConnections: 8,
      ...over,
    })

  it('원시값으로 생성하면 ModelCode/EnergySource/Capacity VO로 변환한다', () => {
    const odu = make()
    expect(odu.model).toBeInstanceOf(ModelCode)
    expect(odu.model.value).toBe('RPUW12BX9M')
    expect(odu.energySource).toBeInstanceOf(EnergySource)
    expect(odu.capacity).toBeInstanceOf(Capacity)
    expect(odu.capacity.kw).toBe(34.8)
    expect(odu.maxConnections).toBe(8)
  })

  it('maxConnections 미지정 시 기본값(양의 정수)을 가진다', () => {
    const odu = make({ maxConnections: undefined })
    expect(Number.isInteger(odu.maxConnections)).toBe(true)
    expect(odu.maxConnections).toBeGreaterThan(0)
  })

  // ─── 적대적 QA ───
  it('[적대] maxConnections가 0 이하이면 예외', () => {
    expect(() => make({ maxConnections: 0 })).toThrow()
    expect(() => make({ maxConnections: -1 })).toThrow()
  })

  it('[적대] 잘못된 계열/용량/모델은 VO에서 예외', () => {
    expect(() => make({ sys: 'XHP' })).toThrow()
    expect(() => make({ capacityKw: 0 })).toThrow()
    expect(() => make({ model: '' })).toThrow()
  })

  describe('단가·에너지등급 (선택 스펙)', () => {
    const entry = (over = {}) => ({
      priceTypeCode: 'CONSUMER',
      priceKrw: 4120000,
      priceWithVatKrw: 4532000,
      effectiveStartDate: '2026-04-20',
      priority: 10,
      ...over,
    })

    it('원시 priceEntries를 받으면 defaultPrice가 Price VO다', () => {
      const odu = make({ priceEntries: [entry()] })
      expect(odu.defaultPrice?.krw).toBe(4120000)
      expect(odu.defaultPrice?.format()).toBe('4,120,000원')
    })

    it('efficiencyGradeId/copCooling을 받으면 grade가 EnergyGrade VO다', () => {
      const odu = make({ efficiencyGradeId: 3, copCooling: 4.99 })
      expect(odu.grade?.value).toBe(3)
      expect(odu.grade?.eerLabel()).toBe('4.99')
    })

    it('단가·등급이 없어도(하위호환) 생성되고 defaultPrice/grade는 undefined', () => {
      const odu = make()
      expect(odu.defaultPrice).toBeUndefined()
      expect(odu.grade).toBeUndefined()
    })

    it('efficiencyGradeId가 null이면 grade는 undefined(등급 미부여)', () => {
      expect(make({ efficiencyGradeId: null, copCooling: 4.0 }).grade).toBeUndefined()
    })

    it('defaultPrice는 priority 최상위 현행가를 선택한다', () => {
      const odu = make({
        priceEntries: [entry({ priceTypeCode: 'SUPPLY', priceKrw: 3000000, priceWithVatKrw: 3300000, priority: 5 }), entry({ priority: 10 })],
      })
      expect(odu.defaultPrice?.krw).toBe(4120000)
    })

    it('defaultPrice는 priority 동률 시 최신 effectiveStartDate를 선택한다(순서 무관)', () => {
      const older = entry({ priceKrw: 1000000, priceWithVatKrw: null, effectiveStartDate: '2026-01-01', priority: 10 })
      const newer = entry({ priceKrw: 2000000, priceWithVatKrw: null, effectiveStartDate: '2026-06-01', priority: 10 })
      expect(make({ priceEntries: [older, newer] }).defaultPrice?.krw).toBe(2000000)
      expect(make({ priceEntries: [newer, older] }).defaultPrice?.krw).toBe(2000000)
    })

    it('priceOf(유형)은 해당 유형 단가를 반환한다', () => {
      const odu = make({ priceEntries: [entry(), entry({ priceTypeCode: 'SUPPLY', priceKrw: 3000000, priceWithVatKrw: 3300000, priority: 20 })] })
      expect(odu.priceOf('SUPPLY')?.krw).toBe(3000000)
      expect(odu.priceOf('CONSUMER')?.krw).toBe(4120000)
    })

    it('equals: 단가·등급이 둘 다 없으면 핵심 필드만으로 동등(회귀 방지)', () => {
      expect(make().equals(make())).toBe(true)
    })

    it('equals: 동일 모델이라도 단가/등급이 다르면 false', () => {
      const a = make({ priceEntries: [entry()] })
      const b = make({ priceEntries: [entry({ priceKrw: 9999999, priceWithVatKrw: null })] })
      expect(a.equals(b)).toBe(false)
      expect(make({ efficiencyGradeId: 1 }).equals(make({ efficiencyGradeId: 3 }))).toBe(false)
    })

    it('[적대] 잘못된 단가/등급은 생성 시 VO 검증으로 예외', () => {
      expect(() => make({ priceEntries: [entry({ priceKrw: -1 })] })).toThrow()
      expect(() => make({ efficiencyGradeId: 6 })).toThrow()
    })
  })
})

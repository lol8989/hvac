import { describe, it, expect } from 'vitest'
import { OutdoorUnit } from './OutdoorUnit.js'
import { Capacity } from '../shared/Capacity.js'
import { EnergySource } from '../shared/EnergySource.js'
import { ModelCode } from '../shared/ModelCode.js'

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
})

import { describe, it, expect } from 'vitest'
import { IndoorUnit } from './IndoorUnit'
import { Capacity } from '../shared/Capacity'
import { EnergySource } from '../shared/EnergySource'

describe('IndoorUnit (실내기 엔티티)', () => {
  const make = () => new IndoorUnit({ id: 'AC_001', roomName: '거실', coolKw: 11.2, sys: 'EHP' })

  it('원시값으로 생성하면 내부에서 Capacity/EnergySource VO로 변환한다', () => {
    const idu = make()
    expect(idu.id).toBe('AC_001')
    expect(idu.roomName).toBe('거실')
    expect(idu.cool).toBeInstanceOf(Capacity)
    expect(idu.cool.kw).toBe(11.2)
    expect(idu.energySource).toBeInstanceOf(EnergySource)
    expect(idu.energySource.code).toBe('EHP')
  })

  it('엔티티 동일성은 id로 판단한다(equals)', () => {
    const a = new IndoorUnit({ id: 'AC_001', roomName: '거실', coolKw: 11.2, sys: 'EHP' })
    const b = new IndoorUnit({ id: 'AC_001', roomName: '거실(수정)', coolKw: 99, sys: 'GHP' })
    const c = new IndoorUnit({ id: 'AC_002', roomName: '침실', coolKw: 5.6, sys: 'EHP' })
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })

  // ─── 적대적 QA ───
  it('[적대] id가 없으면 예외', () => {
    expect(() => new IndoorUnit({ id: '', roomName: '거실', coolKw: 11.2, sys: 'EHP' })).toThrow()
  })

  it('[적대] 잘못된 계열/용량은 VO에서 예외', () => {
    expect(() => new IndoorUnit({ id: 'AC_009', roomName: 'x', coolKw: 11.2, sys: 'XHP' })).toThrow()
    expect(() => new IndoorUnit({ id: 'AC_009', roomName: 'x', coolKw: -1, sys: 'EHP' })).toThrow()
  })
})

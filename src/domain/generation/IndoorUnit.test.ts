import { describe, it, expect } from 'vitest'
import { IndoorUnit, indoorUnitId, roomIdsOf } from './IndoorUnit'
import { Capacity } from '../shared/Capacity'
import { EnergySource } from '../shared/EnergySource'

describe('IndoorUnit (실내기 엔티티 — 1개 = 실내기 1대)', () => {
  const make = () => new IndoorUnit({ id: 'AC_001#1', roomId: 'AC_001', roomName: '거실', coolKw: 11.2, sys: 'EHP' })

  it('원시값으로 생성하면 내부에서 Capacity/EnergySource VO로 변환한다', () => {
    const idu = make()
    expect(idu.id).toBe('AC_001#1')
    expect(idu.roomId).toBe('AC_001')
    expect(idu.roomName).toBe('거실')
    expect(idu.cool).toBeInstanceOf(Capacity)
    expect(idu.cool.kw).toBe(11.2)
    expect(idu.energySource).toBeInstanceOf(EnergySource)
    expect(idu.energySource.code).toBe('EHP')
  })

  it('엔티티 동일성은 id로 판단한다(equals)', () => {
    const a = new IndoorUnit({ id: 'AC_001#1', roomId: 'AC_001', coolKw: 11.2, sys: 'EHP' })
    const b = new IndoorUnit({ id: 'AC_001#1', roomId: 'AC_001', roomName: '거실(수정)', coolKw: 99, sys: 'GHP' })
    const c = new IndoorUnit({ id: 'AC_001#2', roomId: 'AC_001', coolKw: 11.2, sys: 'EHP' })
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false) // 같은 실이어도 다른 대수는 다른 엔티티
  })

  it('같은 실의 2대는 roomId가 같고 id가 다르다', () => {
    const u1 = new IndoorUnit({ id: indoorUnitId('AC_001', 1), roomId: 'AC_001', coolKw: 5.6, sys: 'EHP' })
    const u2 = new IndoorUnit({ id: indoorUnitId('AC_001', 2), roomId: 'AC_001', coolKw: 5.6, sys: 'EHP' })
    expect(u1.roomId).toBe(u2.roomId)
    expect(u1.id).not.toBe(u2.id)
    expect([u1.id, u2.id]).toEqual(['AC_001#1', 'AC_001#2'])
  })

  describe('roomIdsOf', () => {
    it('등장 순서대로 실 id를 유일하게 뽑는다', () => {
      const u = (rid: string, n: number) => new IndoorUnit({ id: indoorUnitId(rid, n), roomId: rid, coolKw: 5, sys: 'EHP' })
      expect(roomIdsOf([u('AC_002', 1), u('AC_001', 1), u('AC_001', 2), u('AC_002', 2)])).toEqual(['AC_002', 'AC_001'])
    })

    it('빈 목록은 빈 배열', () => {
      expect(roomIdsOf([])).toEqual([])
    })
  })

  // ─── 적대적 QA ───
  it('[적대] id가 없으면 예외', () => {
    expect(() => new IndoorUnit({ id: '', roomId: 'AC_001', coolKw: 11.2, sys: 'EHP' })).toThrow()
  })

  it('[적대] roomId가 없으면 예외 — 실에 귀속되지 않은 실내기는 선정표에 실릴 수 없다', () => {
    expect(() => new IndoorUnit({ id: 'AC_001#1', roomId: '', coolKw: 11.2, sys: 'EHP' })).toThrow()
    expect(() => new IndoorUnit({ id: 'AC_001#1', roomId: '   ', coolKw: 11.2, sys: 'EHP' })).toThrow()
  })

  it('[적대] 잘못된 계열/용량은 VO에서 예외', () => {
    expect(() => new IndoorUnit({ id: 'AC_009#1', roomId: 'AC_009', coolKw: 11.2, sys: 'XHP' })).toThrow()
    expect(() => new IndoorUnit({ id: 'AC_009#1', roomId: 'AC_009', coolKw: -1, sys: 'EHP' })).toThrow()
  })
})

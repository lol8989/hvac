import { describe, it, expect } from 'vitest'
import { pointInZone, zoneOfPoint, roomIdsForUnits } from './geometry'
import type { ZoneBox, UnitSym } from './geometry'

const z = (id: string, x: number, y: number, w: number, h: number): ZoneBox => ({ id, name: id, x, y, w, h })
const u = (id: string, x: number, y: number): UnitSym => ({ id, x, y, rot: 0 })

const ZONES: ZoneBox[] = [
  z('AC_001', 0, 0, 100, 100),
  z('AC_002', 100, 0, 100, 100),
]

describe('pointInZone', () => {
  it('내부 점은 true', () => {
    expect(pointInZone(50, 50, ZONES[0])).toBe(true)
  })
  it('경계 점은 포함(true)', () => {
    expect(pointInZone(0, 0, ZONES[0])).toBe(true)
    expect(pointInZone(100, 100, ZONES[0])).toBe(true)
  })
  it('외부 점은 false', () => {
    expect(pointInZone(150, 50, ZONES[0])).toBe(false)
    expect(pointInZone(-1, 50, ZONES[0])).toBe(false)
  })
})

describe('zoneOfPoint', () => {
  it('점을 포함하는 존을 반환', () => {
    expect(zoneOfPoint(150, 50, ZONES)?.id).toBe('AC_002')
  })
  it('어느 존에도 없으면 null', () => {
    expect(zoneOfPoint(500, 500, ZONES)).toBeNull()
  })
  it('겹치면 첫 번째(위 레이어) 존을 반환', () => {
    const overlap: ZoneBox[] = [z('TOP', 0, 0, 100, 100), z('BOTTOM', 0, 0, 100, 100)]
    expect(zoneOfPoint(50, 50, overlap)?.id).toBe('TOP')
  })
})

describe('roomIdsForUnits (선택 심볼 → 담당 실 id, 정체성 우선)', () => {
  it('심볼 식별자가 실 id와 같으면 위치와 무관하게 그 실을 반환한다', () => {
    // 식별자는 AC_001인데 좌표는 AC_002 영역 → 정체성이 이긴다
    const syms = [{ id: 'AC_001', x: 150, y: 50, rot: 0 }]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('식별자가 실과 무관한 자유 심볼은 위치로 역참조한다', () => {
    const syms = [u('IDU7', 150, 50)]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_002'])
  })
  it('같은 실의 여러 심볼은 하나로 합친다', () => {
    const syms = [u('AC_001', 20, 20), u('IDU7', 80, 80)]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('어느 실에도 없는 자유 심볼은 무시한다', () => {
    const syms = [u('AC_001', 50, 50), u('IDU_FREE', 999, 999)]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('선택 심볼이 모두 실과 무관/밖이면 빈 배열', () => {
    expect(roomIdsForUnits([u('IDU_FREE', 999, 999)], ZONES)).toEqual([])
  })
})

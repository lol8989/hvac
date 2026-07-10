import { describe, it, expect } from 'vitest'
import { pointInZone, zoneOfPoint, roomIdsForUnits, zoneAreaM2 } from './geometry'
import type { ZoneBox, UnitSym } from './geometry'

const z = (id: string, x: number, y: number, w: number, h: number): ZoneBox => ({ id, name: id, x, y, w, h })
// 실내기 심볼 1개 = 실내기 1대. roomId가 소속 실이고, id는 `${roomId}#${n}`.
const u = (roomId: string, x: number, y: number, n = 1): UnitSym => ({ id: `${roomId}#${n}`, roomId, x, y, rot: 0 })

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

describe('roomIdsForUnits (선택 심볼 → 담당 실 id, 위치 우선)', () => {
  it('심볼이 다른 실 위로 옮겨지면 그 위치의 실을 반환한다 (드래그 이동 하이라이팅)', () => {
    // 소속은 AC_001인데 좌표는 AC_002 영역 → 위치가 이긴다
    expect(roomIdsForUnits([u('AC_001', 150, 50)], ZONES)).toEqual(['AC_002'])
  })
  it('심볼이 어느 존 밖이면 소속 실(roomId)로 폴백한다', () => {
    expect(roomIdsForUnits([u('AC_001', 999, 999)], ZONES)).toEqual(['AC_001'])
  })
  it('같은 실의 여러 대수는 하나로 합친다', () => {
    const syms = [u('AC_001', 20, 20, 1), u('AC_001', 80, 80, 2)]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('소속 실이 없고 좌표도 실 밖이면 무시한다 (실외기 심볼 등)', () => {
    const syms = [u('AC_001', 50, 50), { id: 'ODU1', x: 999, y: 999, rot: 0 }]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('선택 심볼이 모두 실과 무관/밖이면 빈 배열', () => {
    expect(roomIdsForUnits([{ id: 'ODU1', x: 999, y: 999, rot: 0 }], ZONES)).toEqual([])
  })
})

describe('zoneAreaM2 (존 면적 ㎡ 계산)', () => {
  it('mmPerUnit이 있으면 사각형 기하로 면적을 계산한다 (리사이즈 반영)', () => {
    // 1단위 = 100mm → 50×40단위 = 5m×4m = 20㎡
    expect(zoneAreaM2({ w: 50, h: 40 }, 100)).toBeCloseTo(20)
  })
  it('mmPerUnit이 없으면(목업 좌표계) 설계 면적 폴백을 반환한다', () => {
    expect(zoneAreaM2({ w: 250, h: 150 }, undefined, 31.89)).toBe(31.89)
  })
  it('mmPerUnit도 폴백도 없으면 null을 반환한다', () => {
    expect(zoneAreaM2({ w: 250, h: 150 })).toBeNull()
  })
})

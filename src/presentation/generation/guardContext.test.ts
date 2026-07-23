import { describe, it, expect } from 'vitest'
import { buildGuardContext } from './guardContext'
import type { GroupView } from './planAdapter'

// GroupView 목업 — 가드 컨텍스트가 읽는 필드만 채운다(나머지는 무시).
const group = (over: Partial<GroupView>): GroupView => ({
  key: 'ODU1', label: '실외기-1', model: 'M', cat: 'EHP', sys: 'EHP', cool: 0,
  items: ['AC_001'], unitCount: 1, ratio: 1, judgement: 'OK', comboMin: 0.5, comboMax: 1.03,
  ...over,
})

describe('buildGuardContext', () => {
  it('실·배치·미배정·선정표 행 수를 센다', () => {
    const ctx = buildGuardContext({
      domainRooms: { AC_001: { name: '거실' }, AC_002: { name: '침실' } },
      placements: { AC_001: {} },
      pool: ['AC_002'],
      groups: [],
      activeGroups: [],
      outdoorPositions: {},
      clearance: { checked: true, violations: [] },
      selectionRowCount: 3,
    })
    expect(ctx.roomCount).toBe(2)
    expect(ctx.placedRoomCount).toBe(1)
    expect(ctx.unassignedRoomCount).toBe(1)
    expect(ctx.selectionRowCount).toBe(3)
  })

  it('실내기 없는 실 이름을 모은다(배치되지 않은 실)', () => {
    const ctx = buildGuardContext({
      domainRooms: { AC_001: { name: '거실' }, AC_002: { name: '침실' } },
      placements: { AC_001: {} },
      pool: [],
      groups: [],
      activeGroups: [],
      outdoorPositions: {},
      clearance: { checked: true, violations: [] },
      selectionRowCount: 0,
    })
    expect(ctx.roomsWithoutIndoor).toEqual(['침실'])
  })

  it('빈 그룹 수 = 전체 그룹 - 활성 그룹', () => {
    const active = group({ key: 'ODU1', items: ['AC_001'] })
    const empty = group({ key: 'ODU2', items: [] })
    const ctx = buildGuardContext({
      domainRooms: {},
      placements: {},
      pool: [],
      groups: [active, empty],
      activeGroups: [active],
      outdoorPositions: {},
      clearance: { checked: true, violations: [] },
      selectionRowCount: 0,
    })
    expect(ctx.activeGroupCount).toBe(1)
    expect(ctx.emptyGroupCount).toBe(1)
  })

  it('과부하 그룹·좌표 없는 그룹의 라벨을 모은다', () => {
    const overloaded = group({ key: 'ODU1', label: '실외기-1', judgement: 'OVERLOADED' })
    const noPos = group({ key: 'ODU2', label: '실외기-2', judgement: 'OK' })
    const ctx = buildGuardContext({
      domainRooms: {},
      placements: {},
      pool: [],
      groups: [overloaded, noPos],
      activeGroups: [overloaded, noPos],
      outdoorPositions: { ODU1: { x: 1, y: 1 } }, // ODU1만 배치됨
      clearance: { checked: true, violations: ['이격 위반'] },
      selectionRowCount: 0,
    })
    expect(ctx.overloadedGroups).toEqual(['실외기-1'])
    expect(ctx.groupsWithoutPosition).toEqual(['실외기-2'])
    expect(ctx.clearanceViolations).toEqual(['이격 위반'])
  })

  // '검사했는데 깨끗함'과 '검사하지 못함'은 다른 상태다 — 가드가 둘을 다르게 다룬다.
  it('이격을 검사하지 못했으면 clearanceChecked=false로 옮긴다', () => {
    const ctx = buildGuardContext({
      domainRooms: {},
      placements: {},
      pool: [],
      groups: [],
      activeGroups: [],
      outdoorPositions: {},
      clearance: { checked: false, violations: [] },
      selectionRowCount: 0,
    })
    expect(ctx.clearanceChecked).toBe(false)
    expect(ctx.clearanceViolations).toEqual([])
  })
})

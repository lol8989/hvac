import { describe, it, expect } from 'vitest'
import { GROUP_PALETTE, assignGroupColors, roomColorMap } from './groupColors'
import type { DockFloorView, DockGroupView, DockRoomRow } from './dockView'

const room = (roomId: string): DockRoomRow => ({
  roomId, name: roomId, areaM2: 10, coolKcal: 150, loadKw: 1, model: 'M', qty: 1,
})
const group = (key: string, roomIds: string[]): DockGroupView => ({
  key, label: key, model: 'ODU', hp: 10, coolKw: 28, ratio: 0.9, judgement: 'OK',
  unitCount: roomIds.length, roomCount: roomIds.length, rooms: roomIds.map(room),
})
const floor = (name: string, groups: DockGroupView[], unassigned: string[] = []): DockFloorView => ({
  floor: name, groups, unassigned: unassigned.map(room),
})

describe('assignGroupColors', () => {
  it('층을 가로지르는 순서로 팔레트를 차례대로 배정한다', () => {
    const floors = [
      floor('1층', [group('g1', ['a']), group('g2', ['b'])]),
      floor('2층', [group('g3', ['c'])]),
    ]
    const m = assignGroupColors(floors)
    expect(m.get('g1')).toEqual(GROUP_PALETTE[0])
    expect(m.get('g2')).toEqual(GROUP_PALETTE[1])
    expect(m.get('g3')).toEqual(GROUP_PALETTE[2])
  })

  it('그룹 수가 팔레트를 넘으면 순환한다', () => {
    const groups = Array.from({ length: GROUP_PALETTE.length + 1 }, (_, i) => group('g' + i, ['r' + i]))
    const m = assignGroupColors([floor('1층', groups)])
    expect(m.get('g' + GROUP_PALETTE.length)).toEqual(GROUP_PALETTE[0]) // 다시 첫 색으로
  })

  it('그룹이 없으면 빈 맵', () => {
    expect(assignGroupColors([floor('1층', [])]).size).toBe(0)
  })
})

describe('roomColorMap', () => {
  it('배정된 실은 그 그룹의 색을 받는다', () => {
    const floors = [floor('1층', [group('g1', ['a', 'b']), group('g2', ['c'])])]
    const rc = roomColorMap(floors)
    expect(rc['a']).toEqual(GROUP_PALETTE[0])
    expect(rc['b']).toEqual(GROUP_PALETTE[0])
    expect(rc['c']).toEqual(GROUP_PALETTE[1])
  })

  it('미배정 실은 색을 받지 않는다(맵에 없음 → 도면 무채색)', () => {
    const floors = [floor('1층', [group('g1', ['a'])], ['z'])]
    const rc = roomColorMap(floors)
    expect(rc['a']).toEqual(GROUP_PALETTE[0])
    expect(rc['z']).toBeUndefined()
  })

  it('도크 탭 색과 도면 방 색이 같은 규칙을 쓴다(assignGroupColors와 일치)', () => {
    const floors = [floor('1층', [group('g1', ['a']), group('g2', ['b'])])]
    const byGroup = assignGroupColors(floors)
    const rc = roomColorMap(floors)
    expect(rc['a']).toEqual(byGroup.get('g1'))
    expect(rc['b']).toEqual(byGroup.get('g2'))
  })
})

// 선정표 2단 그룹핑: 층 섹션 > 실외기 그룹 소섹션 (주인님 지시 2026-07-10).
//
// 근거: Confluence「자동배치 룰」 ⑥-(3) "실내기를 층별로 먼저 묶고, 층 안에서만 실외기를 구성한다.
// 한 실외기가 여러 층에 걸치지 않는다." → 그룹은 항상 한 층 안에 있다.
// 그래서 층 안에서 그룹으로 다시 묶고, 조합비를 그룹 소계 행에 놓는다.
import { describe, it, expect } from 'vitest'
import { buildSelectionTable } from './SelectionTable'
import type { SelectionTableInput } from './SelectionTable'
import { Room } from './Room'
import { Placement } from './Placement'
import { POS } from '../../test/positions'
import { IndoorModel } from './IndoorModel'
import { UnitLoad } from '../shared/UnitLoad'

const IDU = new IndoorModel({ code: '40C', model: 'RNW0401C2S', coolW: 4000, heatW: 4500, type: '4WAY 카세트', energySource: 'EHP' })
const ODU_A = { model: 'ODU-A', coolKw: 23.3, heatKw: 26.3, hp: 8 }
const ODU_B = { model: 'ODU-B', coolKw: 29.0, heatKw: 32.0, hp: 10 }

const room = (id: string, floor: string) =>
  Room.create({ id, floor, name: id, areaM2: 20, usage: '사무실', facility: 'OFFICE', shortSideM: 4, longSideM: 5, aiUnitLoad: new UnitLoad(150, 150) })

// 1층: r1·r2 → g1(ODU-A) · r3 → g2(ODU-B)
// 2층: r4 → g3(ODU-A)
const input = (): SelectionTableInput => ({
  rooms: [room('r1', '1층'), room('r2', '1층'), room('r3', '1층'), room('r4', '2층')],
  placements: {
    r1: Placement.ai('r1', { modelCode: '40C', quantity: 2 }, POS(2)),
    r2: Placement.ai('r2', { modelCode: '40C', quantity: 1 }, POS(1)),
    r3: Placement.ai('r3', { modelCode: '40C', quantity: 3 }, POS(3)),
    r4: Placement.ai('r4', { modelCode: '40C', quantity: 1 }, POS(1)),
  },
  groups: [
    { key: 'g1', label: '실외기-1', model: 'ODU-A', items: ['r1', 'r2'] },
    { key: 'g2', label: '실외기-2', model: 'ODU-B', items: ['r3'] },
    { key: 'g3', label: '실외기-3', model: 'ODU-A', items: ['r4'] },
  ],
  indoorModels: [IDU],
  outdoorSpecs: [ODU_A, ODU_B],
})

describe('층 > 실외기 그룹 2단 구조', () => {
  it('층 섹션 안에 그룹 소섹션이 생긴다', () => {
    const { floors } = buildSelectionTable(input())
    expect(floors.map((f) => f.floor)).toEqual(['1층', '2층'])
    expect(floors[0].groups.map((g) => g.key)).toEqual(['g1', 'g2'])
    expect(floors[1].groups.map((g) => g.key)).toEqual(['g3'])
  })

  it('그룹 소섹션이 자기 실 행만 담는다 (표 순서 유지)', () => {
    const { floors } = buildSelectionTable(input())
    expect(floors[0].groups[0].rows.map((r) => r.roomId)).toEqual(['r1', 'r2'])
    expect(floors[0].groups[1].rows.map((r) => r.roomId)).toEqual(['r3'])
  })

  it('그룹 소계는 그 그룹 실내기만 합산한다', () => {
    const { floors } = buildSelectionTable(input())
    const g1 = floors[0].groups[0]
    expect(g1.subtotal).toEqual({ quantity: 3, totalCoolW: 12000, totalHeatW: 13500 }) // 40C ×2 + ×1
    const g2 = floors[0].groups[1]
    expect(g2.subtotal).toEqual({ quantity: 3, totalCoolW: 12000, totalHeatW: 13500 })
  })

  it('조합비·실외기 정보는 그룹 소섹션에 붙는다 (행이 아니라)', () => {
    const { floors } = buildSelectionTable(input())
    const g1 = floors[0].groups[0]
    expect(g1.outdoor.model).toBe('ODU-A')
    expect(g1.outdoor.hp).toBe(8)
    expect(g1.outdoor.comboRatio).toBeCloseTo(12000 / 23300, 4)
    expect(g1.outdoor.judgement).toBe('OK')
    expect(g1.label).toBe('실외기-1')
  })

  it('층 소계는 그 층의 모든 그룹을 합산한다', () => {
    const { floors } = buildSelectionTable(input())
    expect(floors[0].subtotal).toEqual({ quantity: 6, totalCoolW: 24000, totalHeatW: 27000 })
    expect(floors[1].subtotal).toEqual({ quantity: 1, totalCoolW: 4000, totalHeatW: 4500 })
  })

  it('같은 실외기 모델을 쓰는 그룹이 여럿이면 BOM 수량이 합쳐진다', () => {
    const { bom } = buildSelectionTable(input())
    expect(bom.outdoor).toEqual([
      { hp: 8, model: 'ODU-A', quantity: 2 }, // g1 · g3
      { hp: 10, model: 'ODU-B', quantity: 1 },
    ])
    expect(bom.hpTotal).toBe(26) // 8 + 10 + 8
  })
})

describe('배정되지 않은 실', () => {
  it('그룹 없는 실은 층의 미배정 묶음에 모인다', () => {
    const i = input()
    i.groups = [{ key: 'g1', label: '실외기-1', model: 'ODU-A', items: ['r1'] }]
    const { floors } = buildSelectionTable(i)
    expect(floors[0].groups.map((g) => g.key)).toEqual(['g1'])
    expect(floors[0].unassigned.map((r) => r.roomId)).toEqual(['r2', 'r3'])
    expect(floors[1].unassigned.map((r) => r.roomId)).toEqual(['r4'])
  })

  it('미배정 실도 층 소계에는 포함된다 (설치되는 실내기이므로)', () => {
    const i = input()
    i.groups = [{ key: 'g1', label: '실외기-1', model: 'ODU-A', items: ['r1'] }]
    const { floors } = buildSelectionTable(i)
    expect(floors[0].subtotal.quantity).toBe(6) // r1(2) + r2(1) + r3(3)
  })

  it('배정 실이 하나도 없는 그룹은 소섹션을 만들지 않는다', () => {
    const i = input()
    i.groups = [...i.groups, { key: 'g4', label: '실외기-4', model: 'ODU-A', items: [] }]
    const { floors } = buildSelectionTable(i)
    expect(floors.flatMap((f) => f.groups.map((g) => g.key))).not.toContain('g4')
  })
})

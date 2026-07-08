// buildSelectionTable(장비선정표 빌더) 테스트.
// LG 장비선정표 엑셀(표준 260415) 지하1층 시나리오 재현 + 섹션/BOM/예외/판정 검증.

import { describe, it, expect } from 'vitest'
import { buildSelectionTable } from './SelectionTable'
import type { SelectionTable, SelectionTableInput } from './SelectionTable'
import { Room } from './Room'
import { Placement } from './Placement'
import { IndoorModel } from './IndoorModel'
import { ComboRange } from '../shared/ComboRange'
import { UnitLoad } from '../shared/UnitLoad'

// ── 공통 픽스처 ──────────────────────────────────────────────
const IDU_40C = new IndoorModel({
  code: '40C', model: 'RNW0401C2S', coolW: 4000, heatW: 4500, type: '4WAY 카세트', energySource: 'EHP',
})
const IDU_20C = new IndoorModel({
  code: '20C', model: 'RNW0201C2S', coolW: 2000, heatW: 2200, type: '4WAY 카세트', energySource: 'EHP',
})
const ODU_8HP = { model: 'ARUM080LTE5', coolKw: 23.3, heatKw: 26.3, hp: 8 }
const ODU_10HP = { model: 'ARUM100LTE5', coolKw: 29.0, heatKw: 32.0, hp: 10 }

const roomAv = Room.create({ id: 'r1', floor: '지하1층', name: '시청각실', areaM2: 20, usage: '시청각실' })
const roomPrep = Room.create({ id: 'r2', floor: '지하1층', name: '준비실', areaM2: 5.4, usage: '준비실' })

// 엑셀 지하1층 시나리오: 시청각실 40C×3 + 준비실 20C×3 → 실외기 8HP(23.3kW)
const excelInput = (): SelectionTableInput => ({
  rooms: [roomAv, roomPrep],
  placements: {
    r1: Placement.ai('r1', { modelCode: '40C', quantity: 3 }),
    r2: Placement.ai('r2', { modelCode: '20C', quantity: 3 }),
  },
  groups: [{ key: 'g1', label: '실외기 1', model: 'ARUM080LTE5', items: ['r1', 'r2'] }],
  indoorModels: [IDU_40C, IDU_20C],
  outdoorSpecs: [ODU_8HP],
})

// 조합비 판정 시나리오: 실내기 coolW×qty ÷ 10kW 실외기
const ratioInput = (coolW: number, comboRange?: ComboRange): SelectionTableInput => ({
  rooms: [Room.create({ id: 'rx', floor: '1층', name: '실X', areaM2: 10, usage: '사무실' })],
  placements: { rx: Placement.ai('rx', { modelCode: 'X', quantity: 1 }) },
  groups: [{ key: 'gx', label: '실외기 X', model: 'ODU-10', items: ['rx'] }],
  indoorModels: [new IndoorModel({ code: 'X', model: 'X-M', coolW, heatW: coolW, type: '덕트', energySource: 'EHP' })],
  outdoorSpecs: [{ model: 'ODU-10', coolKw: 10, heatKw: null, hp: 10, comboRange }],
})
const firstOutdoor = (t: SelectionTable) => t.floors[0].rows[0].outdoor!

describe('buildSelectionTable — 엑셀 지하1층 재현', () => {
  it('층 소계가 배치 대수 6·총냉방 18000·총난방 20100이면 엑셀과 일치한다', () => {
    const { floors } = buildSelectionTable(excelInput())
    expect(floors).toHaveLength(1)
    expect(floors[0].floor).toBe('지하1층')
    expect(floors[0].subtotal).toEqual({ quantity: 6, totalCoolW: 18000, totalHeatW: 20100 })
  })

  it('행에 실 정보·단위부하·필요부하가 채워지면 엑셀 계산과 일치한다', () => {
    const row = buildSelectionTable(excelInput()).floors[0].rows[0]
    expect(row).toMatchObject({ roomId: 'r1', floor: '지하1층', roomName: '시청각실', areaM2: 20 })
    expect(row.unitLoad.coolKcal).toBe(140)
    expect(row.unitLoad.heatKcal).toBe(140)
    expect(row.unitLoad.coolW).toBeCloseTo(162.82, 6)
    expect(row.unitLoad.overridden).toBe(false)
    expect(row.requiredW.cool).toBeCloseTo(3256.4, 6)
    expect(row.requiredW.heat).toBeCloseTo(3256.4, 6)
  })

  it('배치가 있으면 실내기 정보가 유효 선정으로 해석된다', () => {
    const rows = buildSelectionTable(excelInput()).floors[0].rows
    expect(rows[0].indoor).toEqual({
      code: '40C', model: 'RNW0401C2S', type: '4WAY 카세트', coolW: 4000, heatW: 4500,
      quantity: 3, totalCoolW: 12000, totalHeatW: 13500, overridden: false,
    })
    expect(rows[1].indoor?.totalCoolW).toBe(6000)
    expect(rows[1].indoor?.totalHeatW).toBe(6600)
  })

  it('실외기 8HP 조합비 ≈ 0.7725가 그룹 첫 행에만 부착된다', () => {
    const rows = buildSelectionTable(excelInput()).floors[0].rows
    expect(rows[0].outdoor?.hp).toBe(8)
    expect(rows[0].outdoor?.model).toBe('ARUM080LTE5')
    expect(rows[0].outdoor?.coolKw).toBe(23.3)
    expect(rows[0].outdoor?.heatKw).toBe(26.3)
    expect(rows[0].outdoor?.quantity).toBe(1)
    expect(rows[0].outdoor?.comboRatio).toBeCloseTo(0.7725, 4)
    expect(rows[0].outdoor?.judgement).toBe('OK')
    expect(rows[1].outdoor).toBeNull()
    expect(rows[0].group).toEqual({ key: 'g1', label: '실외기 1' })
    expect(rows[1].group).toEqual({ key: 'g1', label: '실외기 1' })
  })
})

describe('buildSelectionTable — 층 섹션', () => {
  const roomB1a = roomAv
  const room1Fb = Room.create({ id: 'b', floor: '1층', name: '사무실', areaM2: 10, usage: '사무실' })
  const roomB1c = Room.create({ id: 'c', floor: '지하1층', name: '준비실2', areaM2: 5.4, usage: '준비실' })
  const input = (): SelectionTableInput => ({
    rooms: [roomB1a, room1Fb, roomB1c],
    placements: {
      r1: Placement.ai('r1', { modelCode: '40C', quantity: 3 }),
      b: Placement.ai('b', { modelCode: '20C', quantity: 3 }),
      c: Placement.ai('c', { modelCode: '20C', quantity: 3 }),
    },
    groups: [{ key: 'g1', label: '실외기 1', model: 'ARUM080LTE5', items: ['r1', 'b'] }],
    indoorModels: [IDU_40C, IDU_20C],
    outdoorSpecs: [ODU_8HP],
  })

  it('floor 등장 순서로 섹션이 나뉘고 섹션 내 입력 순서가 유지된다', () => {
    const { floors } = buildSelectionTable(input())
    expect(floors.map((f) => f.floor)).toEqual(['지하1층', '1층'])
    expect(floors[0].rows.map((r) => r.roomId)).toEqual(['r1', 'c'])
    expect(floors[1].rows.map((r) => r.roomId)).toEqual(['b'])
    expect(floors[0].subtotal).toEqual({ quantity: 6, totalCoolW: 18000, totalHeatW: 20100 })
    expect(floors[1].subtotal).toEqual({ quantity: 3, totalCoolW: 6000, totalHeatW: 6600 })
  })

  it('여러 층에 걸친 그룹이면 조합비는 모든 층 실내기 총냉방W로 계산해 표 첫 행에 부착한다', () => {
    const { floors } = buildSelectionTable(input())
    expect(floors[0].rows[0].outdoor?.comboRatio).toBeCloseTo(0.7725, 4) // (12000+6000)/23300
    expect(floors[0].rows[1].outdoor).toBeNull()
    expect(floors[1].rows[0].outdoor).toBeNull() // 같은 그룹의 다른 층 실
  })
})

describe('buildSelectionTable — 미지정·빈 그룹', () => {
  it('placement 없는 실은 indoor가 null이고 소계에서 제외된다', () => {
    const input = excelInput()
    const noPlace: SelectionTableInput = { ...input, placements: { r1: input.placements['r1'] } }
    const { floors } = buildSelectionTable(noPlace)
    expect(floors[0].rows[1].indoor).toBeNull()
    expect(floors[0].subtotal).toEqual({ quantity: 3, totalCoolW: 12000, totalHeatW: 13500 })
  })

  it('배정 실이 하나도 없는 그룹은 표와 BOM 모두에 나타나지 않는다', () => {
    const input = excelInput()
    input.groups = [...input.groups, { key: 'g2', label: '실외기 2', model: 'ARUM080LTE5', items: ['ghost'] }]
    const table = buildSelectionTable(input)
    const groupKeys = table.floors.flatMap((f) => f.rows.map((r) => r.group?.key))
    expect(groupKeys).not.toContain('g2')
    expect(table.bom.outdoor).toEqual([{ hp: 8, model: 'ARUM080LTE5', quantity: 1 }])
    expect(table.bom.hpTotal).toBe(8)
  })
})

describe('buildSelectionTable — 오버라이드 플래그 전파', () => {
  it('단위부하를 오버라이드하면 unitLoad.overridden이 true이고 값이 반영된다', () => {
    const input = excelInput()
    input.rooms = [roomAv.overrideUnitLoad(new UnitLoad(200, 210)), roomPrep]
    const row = buildSelectionTable(input).floors[0].rows[0]
    expect(row.unitLoad.overridden).toBe(true)
    expect(row.unitLoad.coolKcal).toBe(200)
    expect(row.unitLoad.heatKcal).toBe(210)
  })

  it('실내기 선정을 오버라이드하면 indoor.overridden이 true이고 선정값이 반영된다', () => {
    const input = excelInput()
    input.placements = {
      ...input.placements,
      r1: input.placements['r1'].overrideSelection({ modelCode: '20C', quantity: 5 }),
    }
    const row = buildSelectionTable(input).floors[0].rows[0]
    expect(row.indoor).toMatchObject({ code: '20C', quantity: 5, totalCoolW: 10000, overridden: true })
  })
})

describe('buildSelectionTable — BOM', () => {
  it('실내기는 code별 표 등장 순서로 합산되고 실외기는 model별 그룹 수로 집계된다', () => {
    const roomC = Room.create({ id: 'r3', floor: '1층', name: '교장실', areaM2: 15, usage: '교장실' })
    const input = excelInput()
    input.rooms = [...input.rooms, roomC]
    input.placements = { ...input.placements, r3: Placement.ai('r3', { modelCode: '40C', quantity: 2 }) }
    input.groups = [
      { key: 'g1', label: '실외기 1', model: 'ARUM080LTE5', items: ['r1'] },
      { key: 'g2', label: '실외기 2', model: 'ARUM080LTE5', items: ['r2'] },
      { key: 'g3', label: '실외기 3', model: 'ARUM100LTE5', items: ['r3'] },
    ]
    input.outdoorSpecs = [ODU_8HP, ODU_10HP]
    const { bom } = buildSelectionTable(input)
    expect(bom.indoor).toEqual([
      { code: '40C', model: 'RNW0401C2S', quantity: 5 },
      { code: '20C', model: 'RNW0201C2S', quantity: 3 },
    ])
    expect(bom.outdoor).toEqual([
      { hp: 8, model: 'ARUM080LTE5', quantity: 2 },
      { hp: 10, model: 'ARUM100LTE5', quantity: 1 },
    ])
    expect(bom.indoorTotal).toBe(8)
    expect(bom.outdoorTotal).toBe(3)
    expect(bom.hpTotal).toBe(26) // 8×2 + 10×1
  })
})

describe('buildSelectionTable — 예외', () => {
  it('카탈로그에 없는 modelCode를 선정한 배치가 있으면 throw한다', () => {
    const input = excelInput()
    input.placements = { ...input.placements, r1: Placement.ai('r1', { modelCode: 'ZZZ', quantity: 1 }) }
    expect(() => buildSelectionTable(input)).toThrow('ZZZ')
  })

  it('outdoorSpecs에 없는 model의 그룹이 있으면 throw한다', () => {
    const input = excelInput()
    input.groups = [{ key: 'g1', label: '실외기 1', model: 'NOPE', items: ['r1'] }]
    expect(() => buildSelectionTable(input)).toThrow('NOPE')
  })
})

describe('buildSelectionTable — comboRange 커스텀(0.3~1.0) judgement', () => {
  const range = new ComboRange(0.3, 1.0)

  it('커스텀 최대(1.0)를 넘으면 OVERLOADED로 판정한다 (기본 범위면 OK인 1.2)', () => {
    expect(firstOutdoor(buildSelectionTable(ratioInput(12000, range))).judgement).toBe('OVERLOADED')
    expect(firstOutdoor(buildSelectionTable(ratioInput(12000))).judgement).toBe('OK') // DEFAULT 0.5~1.3
  })

  it('커스텀 최소(0.3) 이상이면 OK로 판정한다 (기본 범위면 UNDERLOADED인 0.4)', () => {
    expect(firstOutdoor(buildSelectionTable(ratioInput(4000, range))).judgement).toBe('OK')
    expect(firstOutdoor(buildSelectionTable(ratioInput(4000))).judgement).toBe('UNDERLOADED')
  })

  it('커스텀 최소 미만이면 UNDERLOADED, 경계값(0.3·1.0)은 OK로 판정한다', () => {
    expect(firstOutdoor(buildSelectionTable(ratioInput(2000, range))).judgement).toBe('UNDERLOADED')
    expect(firstOutdoor(buildSelectionTable(ratioInput(3000, range))).judgement).toBe('OK')
    expect(firstOutdoor(buildSelectionTable(ratioInput(10000, range))).judgement).toBe('OK')
    expect(firstOutdoor(buildSelectionTable(ratioInput(10000, range))).heatKw).toBeNull()
  })
})

// buildSelectionCsv(장비선정표 CSV 직렬화) 테스트.
// 엑셀 지하1층 시나리오(시청각실 40C×3 + 준비실 20C×3, 8HP) 직렬화 + 인용/공란/층 표기 규칙 검증.

import { describe, it, expect } from 'vitest'
import { buildSelectionCsv } from './selectionCsv'
import { buildSelectionTable } from '../../domain/generation/SelectionTable'
import type { SelectionTableInput } from '../../domain/generation/SelectionTable'
import { Room } from '../../domain/generation/Room'
import { UnitLoad } from '../../domain/shared/UnitLoad'
import { Placement } from '../../domain/generation/Placement'
import { IndoorModel } from '../../domain/generation/IndoorModel'

// ── 공통 픽스처 (SelectionTable.test와 동일 시나리오) ─────────
const IDU_40C = new IndoorModel({
  code: '40C', model: 'RNW0401C2S', coolW: 4000, heatW: 4500, type: '4WAY 카세트', energySource: 'EHP',
})
const IDU_20C = new IndoorModel({
  code: '20C', model: 'RNW0201C2S', coolW: 2000, heatW: 2200, type: '4WAY 카세트', energySource: 'EHP',
})
const ODU_8HP = { model: 'ARUM080LTE5', coolKw: 23.3, heatKw: 26.3, hp: 8 }

const roomAv = Room.create({ id: 'r1', floor: '지하1층', name: '시청각실', areaM2: 20, usage: '시청각실', facility: 'OFFICE', aiUnitLoad: new UnitLoad(140, 140) })
const roomPrep = Room.create({ id: 'r2', floor: '지하1층', name: '준비실', areaM2: 5.4, usage: '준비실', facility: 'OFFICE', aiUnitLoad: new UnitLoad(150, 150) })

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

const csvLines = (input: SelectionTableInput): string[] =>
  buildSelectionCsv(buildSelectionTable(input)).split('\n')

const HEADER =
  '층별,실명,면적(㎡),단위부하 냉방(kcal/h㎡),단위부하 난방(kcal/h㎡),단위부하 냉방(W/㎡),단위부하 난방(W/㎡),' +
  '필요부하 냉방(W),필요부하 난방(W),장비번호,실내기 모델명,냉방용량(W),난방용량(W),대수,총냉방용량(W),총난방용량(W),' +
  '실외기 장비번호(HP),실외기 모델명,실외기 냉방용량(W),실외기 난방용량(W),대수,조합비,비고'

describe('buildSelectionCsv — 엑셀 지하1층 시나리오 직렬화', () => {
  it('헤더 1행과 첫 실 행(층별·실외기 kW→W 변환·조합비 0.7725)이 엑셀 값과 일치한다', () => {
    const lines = csvLines(excelInput())
    expect(lines[0]).toBe(HEADER)
    expect(lines[1]).toBe(
      '지하1층,시청각실,20,140,140,162.8,162.8,3256.4,3256.4,' +
        '40C,RNW0401C2S,4000,4500,3,12000,13500,' +
        '8,ARUM080LTE5,23300,26300,1,0.7725,',
    )
  })

  it('두 번째 실 행은 층별·실외기 칸이 공란이고 실내기 정보만 채워진다', () => {
    const lines = csvLines(excelInput())
    expect(lines[2]).toBe(
      ',준비실,5.4,150,150,174.5,174.5,942,942,20C,RNW0201C2S,2000,2200,3,6000,6600,,,,,,,',
    )
  })

  it('층 섹션 뒤에 합계 행(실명=합계, 대수 6·총냉방 18000·총난방 20100)이 붙는다', () => {
    const lines = csvLines(excelInput())
    expect(lines[3]).toBe(',합계,,,,,,,,,,,,6,18000,20100,,,,,,,')
  })

  it('마지막에 빈 행 + 집계(BOM) 섹션과 HP 합계 행이 붙는다', () => {
    const lines = csvLines(excelInput())
    expect(lines.slice(4)).toEqual([
      '',
      '— 집계 —',
      '실내기,40C,RNW0401C2S,3',
      '실내기,20C,RNW0201C2S,3',
      '실외기,8HP,ARUM080LTE5,1',
      'HP 합계,8',
    ])
  })
})

describe('buildSelectionCsv — RFC4180 인용 처리', () => {
  it('실명에 쉼표·따옴표가 있으면 따옴표로 감싸고 내부 따옴표는 두 번 쓴다', () => {
    const input = excelInput()
    input.rooms = [
      Room.create({ id: 'r1', floor: '지하1층', name: '시청각실,별관', areaM2: 20, usage: '시청각실', facility: 'OFFICE', aiUnitLoad: new UnitLoad(140, 140) }),
      Room.create({ id: 'r2', floor: '지하1층', name: '준비실 "A"', areaM2: 5.4, usage: '준비실', facility: 'OFFICE', aiUnitLoad: new UnitLoad(150, 150) }),
    ]
    const lines = csvLines(input)
    expect(lines[1]).toContain('"시청각실,별관"')
    expect(lines[2]).toContain('"준비실 ""A"""')
  })
})

describe('buildSelectionCsv — 실내기 미지정 실', () => {
  it('placement 없는 실은 실내기 칸(장비번호~총난방)이 공란이고 부하 칸은 유지된다', () => {
    const input = excelInput()
    input.placements = { r1: input.placements['r1'] }
    const lines = csvLines(input)
    expect(lines[2]).toBe(',준비실,5.4,150,150,174.5,174.5,942,942,,,,,,,,,,,,,,')
  })
})

describe('buildSelectionCsv — 층별 표기(엑셀 병합 모방)', () => {
  it('층별 칸은 각 층 섹션의 첫 행에만 표기된다', () => {
    const input = excelInput()
    input.rooms = [
      roomAv,
      roomPrep,
      Room.create({ id: 'r3', floor: '1층', name: '사무실', areaM2: 10, usage: '사무실', facility: 'OFFICE' }),
    ]
    const lines = csvLines(input)
    expect(lines[1].startsWith('지하1층,시청각실')).toBe(true)
    expect(lines[2].startsWith(',준비실')).toBe(true)
    expect(lines[3]).toBe(',합계,,,,,,,,,,,,6,18000,20100,,,,,,,') // 지하1층 소계
    expect(lines[4].startsWith('1층,사무실')).toBe(true)
  })
})

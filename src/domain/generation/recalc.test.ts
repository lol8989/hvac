// recalc 도메인 서비스 테스트 — "상류 수정 → 하류 재계산" 연쇄.
// 정책 핵심: AI 재실행 시 사용자 수정 셀(user 오버라이드)은 보존된다.
// 엑셀 근거: 표준 260415 장비선정표 — 40C(4000/4500W) 3대 = 12000/13500W.

import { describe, it, expect } from 'vitest'
import { IndoorModel } from './IndoorModel'
import { Placement } from './Placement'
import { Room } from './Room'
import { UnitLoad } from '../shared/UnitLoad'
import { applyAiPlacement, aiSelectionFor, placementTotalsW, groupIndoorTotalsW } from './recalc'

// 테스트 카탈로그: 40C(4000/4500) — 엑셀 실측, 70C(7000/8000) — 배수 충돌 없는 대조 모델
const model40C = new IndoorModel({
  code: '40C',
  model: 'RNW0401C2S',
  coolW: 4000,
  heatW: 4500,
  type: '4WAY 카세트',
  energySource: 'EHP',
})
const model70C = new IndoorModel({
  code: '70C',
  model: 'RNW0701C2S',
  coolW: 7000,
  heatW: 8000,
  type: '4WAY 카세트',
  energySource: 'EHP',
})
const models = [model40C, model70C]

// 시청각실(140kcal → 162.82W/㎡) 24㎡ → 필요냉방 3907.68W → 40C×1 추천
const roomA = Room.create({ id: 'r-a', floor: '1F', name: '시청각실', areaM2: 24, usage: '시청각실', facility: 'OFFICE', shortSideM: 4, longSideM: 6, aiUnitLoad: new UnitLoad(140, 140) })

describe('applyAiPlacement', () => {
  it('placement가 없는 실이면 Placement.ai로 새로 생성한다', () => {
    const result = applyAiPlacement([roomA], {}, models)

    expect(result['r-a']).toBeInstanceOf(Placement)
    expect(result['r-a'].effectiveSelection).toEqual({ modelCode: '40C', quantity: 1 })
    expect(result['r-a'].isOverridden).toBe(false)
  })

  it('오버라이드 없는 기존 placement는 AI 추천으로 갱신된다', () => {
    const placements = { 'r-a': Placement.ai('r-a', { modelCode: '70C', quantity: 9 }) }

    const result = applyAiPlacement([roomA], placements, models)

    expect(result['r-a'].effectiveSelection).toEqual({ modelCode: '40C', quantity: 1 })
  })

  it('오버라이드 있는 실은 effectiveSelection을 유지하고 ai값만 갱신한다 (AI 재실행 시 수정 셀 보존)', () => {
    const overridden = Placement.ai('r-a', { modelCode: '40C', quantity: 9 }).overrideSelection({
      modelCode: '70C',
      quantity: 5,
    })

    const result = applyAiPlacement([roomA], { 'r-a': overridden }, models)

    expect(result['r-a'].effectiveSelection).toEqual({ modelCode: '70C', quantity: 5 }) // 수정 셀 보존
    expect(result['r-a'].isOverridden).toBe(true)
    expect(result['r-a'].selection.ai).toEqual({ modelCode: '40C', quantity: 1 }) // ai는 최신 추천
  })

  it('실 면적을 변경한 뒤 재실행하면 추천이 바뀐다 (상류 수정 → 하류 재계산 연쇄)', () => {
    const before = applyAiPlacement([roomA], {}, models)
    expect(before['r-a'].effectiveSelection).toEqual({ modelCode: '40C', quantity: 1 })

    // 44㎡ → 필요냉방 7164.1W. 70C×1(7000W)은 2.3% 부족 → 허용폭 3% 안이라 인정된다.
    // 40C는 2대(8000W)여야 하므로 총용량 최소인 70C×1이 선정된다.
    const enlarged = roomA.withArea(44)
    const after = applyAiPlacement([enlarged], before, models)

    expect(after['r-a'].effectiveSelection).toEqual({ modelCode: '70C', quantity: 1 })
  })

  it('원본 placements Record와 기존 Placement를 파괴하지 않는다', () => {
    const original = Placement.ai('r-a', { modelCode: '70C', quantity: 9 })
    const placements = { 'r-a': original }

    const result = applyAiPlacement([roomA], placements, models)

    expect(result).not.toBe(placements)
    expect(placements['r-a']).toBe(original) // 원본 Record 항목 그대로
    expect(original.effectiveSelection).toEqual({ modelCode: '70C', quantity: 9 })
  })

  it('rooms 목록에 없는 실의 기존 placement는 그대로 유지된다', () => {
    const other = Placement.ai('r-other', { modelCode: '70C', quantity: 2 })

    const result = applyAiPlacement([roomA], { 'r-other': other }, models)

    expect(result['r-other']).toBe(other)
  })

  it('추천 결과는 aiSelectionFor(실)와 일치한다 (규칙 위임 검증)', () => {
    const result = applyAiPlacement([roomA], {}, models)

    expect(result['r-a'].effectiveSelection).toEqual(aiSelectionFor(roomA, models))
  })
})

describe('placementTotalsW', () => {
  it('40C 3대이면 coolW 12000 / heatW 13500이다 (엑셀 실측)', () => {
    const p = Placement.ai('r-a', { modelCode: '40C', quantity: 3 })

    expect(placementTotalsW(p, models)).toEqual({ coolW: 12000, heatW: 13500 })
  })

  it('오버라이드가 있으면 유효 선정(user) 기준으로 계산한다', () => {
    const p = Placement.ai('r-a', { modelCode: '40C', quantity: 3 }).overrideSelection({
      modelCode: '70C',
      quantity: 2,
    })

    expect(placementTotalsW(p, models)).toEqual({ coolW: 14000, heatW: 16000 })
  })

  it('카탈로그에 없는 modelCode이면 throw한다 (정합 보호)', () => {
    const p = Placement.ai('r-a', { modelCode: '999X', quantity: 1 })

    expect(() => placementTotalsW(p, models)).toThrow()
  })
})

describe('groupIndoorTotalsW', () => {
  it('그룹 내 실들의 유효 배치 총용량을 합산한다', () => {
    const placements = {
      'r-a': Placement.ai('r-a', { modelCode: '40C', quantity: 3 }), // 12000/13500
      'r-b': Placement.ai('r-b', { modelCode: '70C', quantity: 1 }), // 7000/8000
    }

    expect(groupIndoorTotalsW(['r-a', 'r-b'], placements, models)).toEqual({
      coolW: 19000,
      heatW: 21500,
    })
  })

  it('placement가 없는 실은 0으로 계상한다', () => {
    const placements = { 'r-a': Placement.ai('r-a', { modelCode: '40C', quantity: 3 }) }

    expect(groupIndoorTotalsW(['r-a', 'r-none'], placements, models)).toEqual({
      coolW: 12000,
      heatW: 13500,
    })
  })

  it('빈 실 목록이면 { coolW: 0, heatW: 0 }이다', () => {
    expect(groupIndoorTotalsW([], {}, models)).toEqual({ coolW: 0, heatW: 0 })
  })

  it('그룹에 속하지 않은 실의 placement는 합산하지 않는다', () => {
    const placements = {
      'r-a': Placement.ai('r-a', { modelCode: '40C', quantity: 3 }),
      'r-out': Placement.ai('r-out', { modelCode: '70C', quantity: 9 }),
    }

    expect(groupIndoorTotalsW(['r-a'], placements, models)).toEqual({
      coolW: 12000,
      heatW: 13500,
    })
  })
})

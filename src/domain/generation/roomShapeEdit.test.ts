import { describe, it, expect } from 'vitest'
import { Room } from './Room'
import { Placement } from './Placement'
import { Polygon } from '../shared/Polygon'
import { splitPlacementAcrossChildren, mergePlacements, reshapeRoom } from './roomShapeEdit'
import type { IndoorSelection } from './IndoorModel'

const room = (over: Partial<Parameters<typeof Room.create>[0]> = {}) =>
  Room.create({ id: 'AC_001', floor: '지상1층', name: '거실', areaM2: 40, usage: '거실', facility: 'OFFICE', shortSideM: 5, longSideM: 8, ...over })
const pos = (x: number, y: number) => ({ x, y, rot: 0 })
const sel = (modelCode: string, quantity: number): IndoorSelection => ({ modelCode, quantity })

describe('splitPlacementAcrossChildren — 자르기 시 심볼 분배', () => {
  const left = { id: 'AC_001-1', poly: Polygon.rect(0, 0, 100, 100) }
  const right = { id: 'AC_001-2', poly: Polygon.rect(100, 0, 100, 100) }

  it('심볼을 포함하는 자식에게 배정한다(대수 = 그 조각의 심볼 수)', () => {
    const parent = Placement.ai('AC_001', sel('M', 3), [pos(20, 50), pos(60, 50), pos(150, 50)])
    const out = splitPlacementAcrossChildren(parent, [left, right])
    expect(out['AC_001-1'].effectiveSelection.quantity).toBe(2) // 20·60 → 왼쪽
    expect(out['AC_001-2'].effectiveSelection.quantity).toBe(1) // 150 → 오른쪽
    expect(out['AC_001-1'].effectiveSelection.modelCode).toBe('M')
  })

  it('심볼이 없는 자식은 결과에 없다(미배치 — 불변식 우회 안 함)', () => {
    const out = splitPlacementAcrossChildren(Placement.ai('AC_001', sel('M', 1), [pos(20, 50)]), [left, right])
    expect(out['AC_001-1']).toBeDefined()
    expect(out['AC_001-2']).toBeUndefined()
  })

  it('부모가 오버라이드(수정 셀)면 자식도 승계한다', () => {
    const parent = Placement.ai('AC_001', sel('M', 1), [pos(20, 50)]).overrideSelection(sel('M', 1), [pos(20, 50)])
    expect(splitPlacementAcrossChildren(parent, [left, right])['AC_001-1'].isOverridden).toBe(true)
  })

  it('부모 배치가 없으면 빈 결과', () => {
    expect(splitPlacementAcrossChildren(undefined, [left, right])).toEqual({})
  })
})

describe('mergePlacements — 병합 시 심볼 합침', () => {
  it('두 실의 심볼을 합치고 대수 많은 쪽 모델을 승계한다', () => {
    const pa = Placement.ai('a', sel('MA', 2), [pos(0, 0), pos(10, 0)])
    const pb = Placement.ai('b', sel('MB', 1), [pos(100, 0)])
    const m = mergePlacements(pa, pb, 'merged', 30, 20)!
    expect(m.effectiveSelection.quantity).toBe(3)
    expect(m.effectiveSelection.modelCode).toBe('MA')
  })

  it('대수 동수면 면적이 큰 쪽 모델을 승계한다', () => {
    const pa = Placement.ai('a', sel('MA', 1), [pos(0, 0)])
    const pb = Placement.ai('b', sel('MB', 1), [pos(100, 0)])
    expect(mergePlacements(pa, pb, 'm', 10, 30)!.effectiveSelection.modelCode).toBe('MB') // b 면적 큼
  })

  it('좌표가 하나도 없으면 null(실내기 없는 실)', () => {
    expect(mergePlacements(undefined, undefined, 'm', 10, 20)).toBeNull()
  })

  it('한 쪽이라도 오버라이드면 결과도 오버라이드', () => {
    const pa = Placement.ai('a', sel('MA', 1), [pos(0, 0)]).overrideSelection(sel('MA', 1), [pos(0, 0)])
    const pb = Placement.ai('b', sel('MB', 1), [pos(100, 0)])
    expect(mergePlacements(pa, pb, 'm', 30, 10)!.isOverridden).toBe(true)
  })
})

describe('reshapeRoom — 리사이즈 시 면적·치수 재유도', () => {
  it('축척(m/단위)을 지키며 새 폴리곤 면적으로 다시 유도한다(폭 2배 → 면적 2배)', () => {
    const r = room({ areaM2: 40 })
    const prev = Polygon.rect(0, 0, 100, 100) // 10000 단위² = 40㎡
    const next = Polygon.rect(0, 0, 200, 100) // 20000 단위² = 80㎡
    expect(reshapeRoom(r, prev, next).areaM2).toBeCloseTo(80, 3)
  })
})

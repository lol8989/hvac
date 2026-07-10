/** @vitest-environment jsdom */
// 선정표 검토 그리드 — 핵심 상호작용(편집 셀 커밋·초기화·그룹 이동) 테스트.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectionGrid from './SelectionGrid'
import { buildSelectionTable } from '../../domain/generation/SelectionTable'
import { Room } from '../../domain/generation/Room'
import { Placement } from '../../domain/generation/Placement'
import { IndoorModel } from '../../domain/generation/IndoorModel'

// 픽스처: 엑셀 지하1층 축약(시청각실 40C×3 → 8HP, 조합비 0.7725 근처 시나리오)
const models = [
  new IndoorModel({ code: '20C', model: 'RNW0201C2S', coolW: 2000, heatW: 2200, type: '4WAY 카세트', energySource: 'EHP' }),
  new IndoorModel({ code: '40C', model: 'RNW0401C2S', coolW: 4000, heatW: 4500, type: '4WAY 카세트', energySource: 'EHP' }),
]
const rooms = [
  Room.create({ id: 'R1', floor: '지하1층', name: '시청각실', areaM2: 20, usage: '시청각실', facility: 'OFFICE' }),
  Room.create({ id: 'R2', floor: '지하1층', name: '준비실', areaM2: 5.4, usage: '준비실', facility: 'OFFICE' }),
]
const placements = {
  R1: Placement.ai('R1', { modelCode: '40C', quantity: 3 }),
  R2: Placement.ai('R2', { modelCode: '20C', quantity: 3 }).overrideSelection({ modelCode: '20C', quantity: 2 }),
}
const table = buildSelectionTable({
  rooms,
  placements,
  groups: [{ key: 'ODU1', label: '실외기-1', model: 'RPUW082X9E', items: ['R1', 'R2'] }],
  indoorModels: models,
  outdoorSpecs: [{ model: 'RPUW082X9E', coolKw: 23.3, heatKw: 25.9, hp: 8, comboRange: undefined }],
})

const noop = {
  onRenameRoom: vi.fn(),
  onOverrideUnitLoad: vi.fn(),
  onResetUnitLoad: vi.fn(),
  onOverrideIndoor: vi.fn(),
  onResetIndoor: vi.fn(),
  onMoveRoom: vi.fn(),
}
const renderGrid = (over: Partial<typeof noop> = {}) =>
  render(
    <SelectionGrid
      table={table}
      groupOptions={[{ key: 'ODU1', label: '실외기-1' }]}
      indoorModels={models}
      {...noop}
      {...over}
    />,
  )

describe('SelectionGrid', () => {
  it('층 섹션·합계 행·조합비·AI/수정 뱃지를 표시한다', () => {
    renderGrid()
    expect(screen.getByText('지하1층')).toBeInTheDocument()
    expect(screen.getAllByText(/합계/).length).toBeGreaterThan(0) // 층 합계 행(+BOM 합계)
    // 조합비 = (12000+4000) / 23300 = 68.7% — 실무는 퍼센트로 말한다(그룹 소계 행에 표기)
    expect(screen.getByText('68.7%')).toBeInTheDocument()
    // R1은 AI 선정, R2는 수동 오버라이드(대수 2)
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0)
    expect(screen.getAllByText('수정').length).toBe(1)
  })

  // 같은 실외기에 엮인 실이 한눈에 묶여 보여야 한다(주인님 지시).
  it('실외기 그룹마다 소계 행을 두고 조합비를 거기에 붙인다', () => {
    const { container } = renderGrid()
    const groupSubtotals = container.querySelectorAll('tr.group-subtotal')
    expect(groupSubtotals.length).toBe(1) // 그룹 1개
    expect(groupSubtotals[0].textContent).toContain('68.7%')
    expect(groupSubtotals[0].textContent).toContain('8HP')
    // 그룹 시작 행에 기준선 클래스가 붙는다
    expect(container.querySelectorAll('tr.group-start').length).toBe(1)
  })

  it('실명을 수정하고 blur하면 onRenameRoom이 호출된다', () => {
    const onRenameRoom = vi.fn()
    renderGrid({ onRenameRoom })
    const input = screen.getByDisplayValue('시청각실')
    fireEvent.change(input, { target: { value: '멀티미디어실' } })
    fireEvent.blur(input)
    expect(onRenameRoom).toHaveBeenCalledWith('R1', '멀티미디어실')
  })

  it('대수를 수정하면 onOverrideIndoor(실, 모델코드, 새 대수)가 호출된다', () => {
    const onOverrideIndoor = vi.fn()
    renderGrid({ onOverrideIndoor })
    const qty = screen.getByDisplayValue('3') // R1 대수
    fireEvent.change(qty, { target: { value: '4' } })
    fireEvent.blur(qty)
    expect(onOverrideIndoor).toHaveBeenCalledWith('R1', '40C', 4)
  })

  it('대수에 0·소수 같은 잘못된 값을 넣으면 커밋하지 않는다', () => {
    const onOverrideIndoor = vi.fn()
    renderGrid({ onOverrideIndoor })
    const qty = screen.getByDisplayValue('3')
    fireEvent.change(qty, { target: { value: '0' } })
    fireEvent.blur(qty)
    expect(onOverrideIndoor).not.toHaveBeenCalled()
  })

  it('수정 셀의 ↺를 누르면 onResetIndoor가 호출된다', () => {
    const onResetIndoor = vi.fn()
    renderGrid({ onResetIndoor })
    fireEvent.click(screen.getByTitle('AI 추천으로 초기화'))
    expect(onResetIndoor).toHaveBeenCalledWith('R2')
  })

  it('그룹 셀렉트를 미배정으로 바꾸면 onMoveRoom(실, pool)이 호출된다', () => {
    const onMoveRoom = vi.fn()
    renderGrid({ onMoveRoom })
    const selects = screen.getAllByDisplayValue('실외기-1')
    fireEvent.change(selects[0], { target: { value: 'pool' } })
    expect(onMoveRoom).toHaveBeenCalledWith('R1', 'pool')
  })

  it('BOM 집계(장비번호별 대수·HP 합계)를 표시한다', () => {
    renderGrid()
    expect(screen.getByText('실내기 집계')).toBeInTheDocument()
    expect(screen.getByText('HP 합계')).toBeInTheDocument()
    expect(screen.getAllByText('8HP').length).toBeGreaterThan(0) // 그룹 소계 행 + BOM
  })
})

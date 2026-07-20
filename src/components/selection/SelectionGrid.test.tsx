/** @vitest-environment jsdom */
// 선정표 검토 그리드 — 핵심 상호작용(편집 셀 커밋·초기화·그룹 이동) 테스트.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SelectionGrid from './SelectionGrid'
import { buildSelectionTable } from '../../domain/generation/SelectionTable'
import { Room } from '../../domain/generation/Room'
import { Placement } from '../../domain/generation/Placement'
import { POS } from '../../test/positions'
import { IndoorModel } from '../../domain/generation/IndoorModel'
import { UnitLoad } from '../../domain/shared/UnitLoad'

// 픽스처: 엑셀 지하1층 축약(시청각실 40C×3 → 8HP, 조합비 0.7725 근처 시나리오)
const models = [
  new IndoorModel({ model: 'RNW0201C2S', coolW: 2000, heatW: 2200, type: '4WAY 카세트', energySource: 'EHP' }),
  new IndoorModel({ model: 'RNW0401C2S', coolW: 4000, heatW: 4500, type: '4WAY 카세트', energySource: 'EHP' }),
]
const rooms = [
  Room.create({ id: 'R1', floor: '지하1층', name: '시청각실', areaM2: 20, usage: '시청각실', facility: 'OFFICE', shortSideM: 4, longSideM: 5 }),
  Room.create({ id: 'R2', floor: '지하1층', name: '준비실', areaM2: 5.4, usage: '준비실', facility: 'OFFICE', shortSideM: 2, longSideM: 2.7 }),
]
const placements = {
  R1: Placement.ai('R1', { modelCode: 'RNW0401C2S', quantity: 3 }, POS(3)),
  R2: Placement.ai('R2', { modelCode: 'RNW0201C2S', quantity: 3 }, POS(3)).overrideSelection({ modelCode: 'RNW0201C2S', quantity: 2 }, POS(2)),
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
      indoorModels={models.map((m) => ({ code: m.model }))}
      {...noop}
      {...over}
    />,
  )

describe('SelectionGrid', () => {
  it('층 섹션·합계 행·조합비·수정 뱃지를 표시한다', () => {
    renderGrid()
    expect(screen.getByText('지하1층')).toBeInTheDocument()
    expect(screen.getAllByText(/합계/).length).toBeGreaterThan(0) // 층 합계 행(+BOM 합계)
    // 조합비 = (12000+4000) / 23300 = 68.7% — 실무는 퍼센트로 말한다(그룹 소계 행에 표기)
    expect(screen.getByText('68.7%')).toBeInTheDocument()
    // 사람이 손댄 셀(수정)만 표시한다 — 'AI'는 거의 모든 행에 붙어 정보가 없다(주인님 지시 2026-07-14)
    expect(screen.queryByText('AI')).toBeNull()
    expect(screen.getAllByText('수정').length).toBe(1) // R2만 수동 오버라이드(대수 2)
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
    expect(onOverrideIndoor).toHaveBeenCalledWith('R1', 'RNW0401C2S', 4)
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

  // 유저가 단위부하를 직접 고쳤을 때만 '적정 수치'인지 표기한다(주인님 지시 2026-07-16).
  // 근거: 사무실(OFFICE) 적정범위 145~200 kcal/h·㎡ (표의 저~특수 칸).
  describe('단위부하 오버라이드 적정 판정', () => {
    const officeTable = (coolKcal: number | null) => {
      let room = Room.create({ id: 'X', floor: '1층', name: '사무실', areaM2: 10, usage: '사무실', facility: 'OFFICE', shortSideM: 2.5, longSideM: 4 })
      if (coolKcal !== null) room = room.overrideUnitLoad(new UnitLoad(coolKcal, coolKcal))
      return buildSelectionTable({ rooms: [room], placements: {}, groups: [], indoorModels: models, outdoorSpecs: [] })
    }
    const renderOffice = (coolKcal: number | null) =>
      render(<SelectionGrid table={officeTable(coolKcal)} groupOptions={[]} indoorModels={models.map((m) => ({ code: m.model }))} {...noop} />)

    it('오버라이드 값이 적정 범위를 벗어나면 범위를 함께 알린다', () => {
      renderOffice(300)
      expect(screen.getByText(/범위밖 145~200/)).toBeInTheDocument()
    })

    it('오버라이드 값이 적정 범위 안이면 적정으로 표기한다', () => {
      renderOffice(160)
      expect(screen.getByText('적정')).toBeInTheDocument()
    })

    it('오버라이드하지 않은 실은 적정/범위밖 뱃지를 달지 않는다', () => {
      renderOffice(null)
      expect(screen.queryByText('적정')).toBeNull()
      expect(screen.queryByText(/범위밖/)).toBeNull()
    })
  })
})

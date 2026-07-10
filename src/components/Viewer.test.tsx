/** @vitest-environment jsdom */
// Viewer 상호작용 회귀 테스트.
// 실내기 심볼은 App(Placement)이 소유한다(controlled) — 뷰어는 그리고, 편집은 콜백으로 올린다.
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Viewer, { type UnitMove } from './Viewer'
import type { UnitSym } from './viewer/geometry'
import type { Room } from '../data'

const ROOMS_FX: Record<string, Room> = {
  AC_001: { name: '거실', floor: '지상1층', usage: '거실', area: 31.89, type: '4WAY', cool: 11.2, shortSideM: 4.37, longSideM: 7.29, sys: 'EHP', x: 24, y: 24, w: 680, h: 420 },
}

// 실 AC_001에 실내기 2대(같은 실, 다른 대수 번호)
const TWO_UNITS: UnitSym[] = [
  { id: 'AC_001#1', roomId: 'AC_001', x: 200, y: 200, rot: 0 },
  { id: 'AC_001#2', roomId: 'AC_001', x: 400, y: 200, rot: 0 },
]

function Harness({ symbols = TWO_UNITS, onUnitAdd, onUnitsMove }: { symbols?: UnitSym[]; onUnitAdd?: (r: string) => void; onUnitsMove?: (m: UnitMove[]) => void }) {
  const [sel, setSel] = useState<string[]>([])
  return (
    <>
      <div data-testid="sel-rooms">{sel.join(',')}</div>
      <button data-testid="select-room" onClick={() => setSel(['AC_001'])}>실선택</button>
      <Viewer
        rooms={ROOMS_FX}
        selectedIds={sel}
        onSelectionChange={setSel}
        indoorSymbols={symbols}
        outdoorSymbols={[]}
        onUnitAdd={onUnitAdd}
        onUnitsMove={onUnitsMove}
        canAddUnit
      />
    </>
  )
}

describe('Viewer 선택 동기화', () => {
  it('같은 실의 2대 중 하나만 클릭하면 그 한 대만 선택된다', () => {
    const { container } = render(<Harness />)

    // 본체(회전 그룹)에 mouseDown 핸들러가 달려 있다.
    const body = container.querySelector('[data-unit-id="AC_001#1"] > g')
    expect(body).not.toBeNull()
    fireEvent.mouseDown(body!)

    expect(container.querySelector('[data-unit-id="AC_001#1"]')).toHaveAttribute('data-selected', 'true')
    expect(container.querySelector('[data-unit-id="AC_001#2"]')).not.toHaveAttribute('data-selected')
    // 순방향 동기화: 클릭한 심볼이 놓인 실이 패널 선택으로 올라간다.
    expect(screen.getByTestId('sel-rooms').textContent).toBe('AC_001')
  })

  it('패널에서 실을 선택하면 그 실의 모든 대수 심볼이 선택된다 (역방향 동기화)', () => {
    const { container } = render(<Harness />)

    fireEvent.click(screen.getByTestId('select-room'))
    expect(container.querySelector('[data-unit-id="AC_001#1"]')).toHaveAttribute('data-selected', 'true')
    expect(container.querySelector('[data-unit-id="AC_001#2"]')).toHaveAttribute('data-selected', 'true')
  })

  it('실내기를 드래그해 다른 실로 옮기면 옮겨진 실이 하이라이팅(선택)된다', () => {
    // 좌우로 나란한 두 실.
    const rooms: Record<string, Room> = {
      AC_001: { name: '거실', floor: '지상1층', usage: '거실', area: 20, type: '4WAY', cool: 9, shortSideM: 4.5, longSideM: 4.5, sys: 'EHP', x: 0, y: 0, w: 200, h: 200 },
      AC_002: { name: '침실', floor: '지상1층', usage: '침실', area: 20, type: '4WAY', cool: 5.6, shortSideM: 4.5, longSideM: 4.5, sys: 'EHP', x: 300, y: 0, w: 200, h: 200 },
    }
    // 부모가 커밋 결과를 다시 내려주는 controlled 흐름을 흉내낸다.
    const Two = () => {
      const [sel, setSel] = useState<string[]>([])
      const [syms, setSyms] = useState<UnitSym[]>([{ id: 'AC_001#1', roomId: 'AC_001', x: 100, y: 100, rot: 0 }])
      const move = (moves: UnitMove[]) =>
        setSyms((prev) => prev.map((s) => { const m = moves.find((x) => x.id === s.id); return m ? { ...s, x: m.x, y: m.y } : s }))
      return (
        <>
          <div data-testid="sel-rooms">{sel.join(',')}</div>
          <Viewer rooms={rooms} selectedIds={sel} onSelectionChange={setSel} indoorSymbols={syms} outdoorSymbols={[]} onUnitsMove={move} />
        </>
      )
    }
    const { container } = render(<Two />)

    const body = container.querySelector('[data-unit-id="AC_001#1"] > g')
    expect(body).not.toBeNull()
    fireEvent.mouseDown(body!, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 400, clientY: 100 })
    fireEvent.mouseUp(window)

    expect(screen.getByTestId('sel-rooms').textContent).toBe('AC_002')
  })
})

describe('Viewer 실내기 편집 커밋 (도면 심볼 = 대수)', () => {
  it('드래그 중에는 커밋하지 않고, 마우스를 뗄 때 한 번만 onUnitsMove를 부른다', () => {
    const onUnitsMove = vi.fn()
    const { container } = render(<Harness onUnitsMove={onUnitsMove} />)

    const body = container.querySelector('[data-unit-id="AC_001#1"] > g')!
    fireEvent.mouseDown(body, { clientX: 200, clientY: 200 })
    fireEvent.mouseMove(window, { clientX: 240, clientY: 200 })
    fireEvent.mouseMove(window, { clientX: 280, clientY: 200 })
    expect(onUnitsMove).not.toHaveBeenCalled() // 드래그 중엔 App을 건드리지 않는다

    fireEvent.mouseUp(window)
    expect(onUnitsMove).toHaveBeenCalledTimes(1)
    expect(onUnitsMove.mock.calls[0][0][0].id).toBe('AC_001#1')
  })

  it('＋ 실내기는 실을 선택해야 활성화되고, 선택한 실 id로 onUnitAdd를 부른다', () => {
    const onUnitAdd = vi.fn()
    render(<Harness onUnitAdd={onUnitAdd} />)

    const btn = screen.getByRole('button', { name: '＋ 실내기' })
    expect(btn).toBeDisabled() // 실 선택 전
    fireEvent.click(screen.getByTestId('select-room'))
    expect(btn).toBeEnabled()

    fireEvent.click(btn)
    expect(onUnitAdd).toHaveBeenCalledWith('AC_001')
  })

  it('실내기가 없는 실이면 심볼도 없다(빈 배열 렌더)', () => {
    const { container } = render(<Harness symbols={[]} />)
    expect(container.querySelector('[data-unit-id^="AC_001"]')).toBeNull()
  })
})

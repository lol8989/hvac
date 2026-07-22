/** @vitest-environment jsdom */
// Viewer 상호작용 회귀 테스트.
// 실내기 심볼은 App(Placement)이 소유한다(controlled) — 뷰어는 그리고, 편집은 콜백으로 올린다.
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Viewer, { type UnitMove } from './Viewer'
import type { UnitSym } from './viewer/geometry'
import { rectPoints } from './viewer/geometry'
import type { Room } from '../data'

const ROOMS_FX: Record<string, Room> = {
  AC_001: { name: '거실', floor: '지상1층', usage: '거실', area: 31.89, type: '4WAY', cool: 11.2, shortSideM: 4.37, longSideM: 7.29, sys: 'EHP', points: rectPoints(24, 24, 680, 420) },
}

// 실 AC_001에 실내기 2대(같은 실, 다른 대수 번호)
const TWO_UNITS: UnitSym[] = [
  { id: 'AC_001#1', roomId: 'AC_001', x: 200, y: 200, rot: 0 },
  { id: 'AC_001#2', roomId: 'AC_001', x: 400, y: 200, rot: 0 },
]

function Harness({ symbols = TWO_UNITS, onUnitAdd, onUnitsMove, onAddUnitUnavailable, canAddUnit = true }: { symbols?: UnitSym[]; onUnitAdd?: (r: string) => void; onUnitsMove?: (m: UnitMove[]) => void; onAddUnitUnavailable?: (reason: 'step' | 'noRoom') => void; canAddUnit?: boolean }) {
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
        onAddUnitUnavailable={onAddUnitUnavailable}
        canAddUnit={canAddUnit}
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
      AC_001: { name: '거실', floor: '지상1층', usage: '거실', area: 20, type: '4WAY', cool: 9, shortSideM: 4.5, longSideM: 4.5, sys: 'EHP', points: rectPoints(0, 0, 200, 200) },
      AC_002: { name: '침실', floor: '지상1층', usage: '침실', area: 20, type: '4WAY', cool: 5.6, shortSideM: 4.5, longSideM: 4.5, sys: 'EHP', points: rectPoints(300, 0, 200, 200) },
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

  // 버튼은 항상 활성이다(§3 UI 정책 — 죽이지 않고 누르면 이유를 안내한다).
  it('＋ 실내기는 실 선택 전에도 활성이고, 그냥 누르면 안내(noRoom)만 하고 onUnitAdd는 안 부른다', () => {
    const onUnitAdd = vi.fn()
    const onAddUnitUnavailable = vi.fn()
    render(<Harness onUnitAdd={onUnitAdd} onAddUnitUnavailable={onAddUnitUnavailable} />)

    const btn = screen.getByRole('button', { name: '＋ 실내기' })
    expect(btn).toBeEnabled() // 실 선택 전에도 활성
    fireEvent.click(btn)
    expect(onAddUnitUnavailable).toHaveBeenCalledWith('noRoom')
    expect(onUnitAdd).not.toHaveBeenCalled()
  })

  it('실을 선택하고 ＋ 실내기를 누르면 그 실 id로 onUnitAdd를 부른다', () => {
    const onUnitAdd = vi.fn()
    render(<Harness onUnitAdd={onUnitAdd} />)
    fireEvent.click(screen.getByTestId('select-room'))
    fireEvent.click(screen.getByRole('button', { name: '＋ 실내기' }))
    expect(onUnitAdd).toHaveBeenCalledWith('AC_001')
  })

  it('실내기 배치 단계가 아니면(canAddUnit=false) 눌러도 step 안내만 한다', () => {
    const onUnitAdd = vi.fn()
    const onAddUnitUnavailable = vi.fn()
    render(<Harness canAddUnit={false} onUnitAdd={onUnitAdd} onAddUnitUnavailable={onAddUnitUnavailable} />)
    const btn = screen.getByRole('button', { name: '＋ 실내기' })
    expect(btn).toBeEnabled() // 항상 활성
    fireEvent.click(btn)
    expect(onAddUnitUnavailable).toHaveBeenCalledWith('step')
    expect(onUnitAdd).not.toHaveBeenCalled()
  })

  it('실내기가 없는 실이면 심볼도 없다(빈 배열 렌더)', () => {
    const { container } = render(<Harness symbols={[]} />)
    expect(container.querySelector('[data-unit-id^="AC_001"]')).toBeNull()
  })
})

// 실은 마운트 이후에 생긴다 — 검출은 뷰어가 뜬 뒤에 실행된다.
// 존을 마운트 시점 rooms로만 초기화하면 검출된 실이 도면에 영원히 안 그려진다.
describe('Viewer 실(존) 동기화', () => {
  function ZoneHarness() {
    const [rooms, setRooms] = useState<Record<string, Room>>({})
    return (
      <>
        <button data-testid="detect" onClick={() => setRooms(ROOMS_FX)}>검출</button>
        <Viewer rooms={rooms} selectedIds={[]} onSelectionChange={() => {}} indoorSymbols={[]} outdoorSymbols={[]} />
      </>
    )
  }

  it('마운트 후 rooms가 채워지면 실이 도면에 그려진다', () => {
    render(<ZoneHarness />)
    expect(screen.queryByText('거실')).toBeNull() // 검출 전

    fireEvent.click(screen.getByTestId('detect'))
    expect(screen.getByText('거실')).toBeInTheDocument() // 검출 후 존 라벨
  })

  it('rooms가 비워지면(재검출 초기화) 실도 사라진다', () => {
    const { rerender } = render(
      <Viewer rooms={ROOMS_FX} selectedIds={[]} onSelectionChange={() => {}} indoorSymbols={[]} outdoorSymbols={[]} />,
    )
    expect(screen.getByText('거실')).toBeInTheDocument()

    rerender(<Viewer rooms={{}} selectedIds={[]} onSelectionChange={() => {}} indoorSymbols={[]} outdoorSymbols={[]} />)
    expect(screen.queryByText('거실')).toBeNull()
  })
})

// V(실 자르기): 포인터 대신 라인이 커서가 되고, 실을 클릭하면 그 위치·각도로 잘린다.
describe('Viewer 실 자르기(V)', () => {
  const sliceHarness = (over: Partial<React.ComponentProps<typeof Viewer>> = {}) =>
    render(
      <Viewer
        rooms={ROOMS_FX}
        selectedIds={[]}
        onSelectionChange={() => {}}
        indoorSymbols={[]}
        outdoorSymbols={[]}
        canSliceRooms
        {...over}
      />,
    )

  it('V를 누르면 도구바가 실 자르기로 바뀐다', () => {
    sliceHarness()
    fireEvent.keyDown(window, { key: 'v' })
    expect(screen.getByText('실 자르기')).toBeInTheDocument()
  })

  it('하단 플로팅 메뉴에도 실 자르기 도구가 있다', () => {
    sliceHarness()
    fireEvent.click(screen.getByTitle('도구 선택'))
    const item = screen.getByRole('button', { name: /실 자르기/ })
    fireEvent.click(item)
    expect(screen.getByText(/실 자르기 · 90°/)).toBeInTheDocument() // 자르기 HUD
  })

  it('R을 누르면 라인이 15°씩 회전한다', () => {
    const { container } = sliceHarness()
    const hud = () => container.querySelector('.slicehud')!.textContent
    fireEvent.keyDown(window, { key: 'v' })
    expect(hud()).toContain('90°')

    fireEvent.keyDown(window, { key: 'r' })
    expect(hud()).toContain('105°')
    fireEvent.keyDown(window, { key: 'r' })
    expect(hud()).toContain('120°')
  })

  it('180°를 넘으면 0°로 돌아온다(직선은 180°가 제자리)', () => {
    sliceHarness()
    fireEvent.keyDown(window, { key: 'v' })
    for (let i = 0; i < 6; i++) fireEvent.keyDown(window, { key: 'r' }) // 90 + 90
    expect(screen.getByText(/실 자르기 · 0°/)).toBeInTheDocument()
  })

  // R은 모드마다 다른 일을 한다 — 에어컨 모드의 90° 회전이 죽으면 안 된다.
  it('[회귀] 에어컨 모드의 R은 여전히 선택 실내기를 90° 회전시킨다', () => {
    const onUnitsRotate = vi.fn()
    const { container } = sliceHarness({ indoorSymbols: TWO_UNITS, onUnitsRotate })

    fireEvent.mouseDown(container.querySelector('[data-unit-id="AC_001#1"] > g')!)
    fireEvent.keyDown(window, { key: 'r' })

    expect(onUnitsRotate).toHaveBeenCalledWith([{ id: 'AC_001#1', rot: 90 }])
  })

  it('실을 클릭하면 그 좌표와 각도로 onRoomSlice를 부른다', () => {
    const onRoomSlice = vi.fn()
    const { container } = sliceHarness({ onRoomSlice })
    fireEvent.keyDown(window, { key: 'v' })

    fireEvent.mouseDown(container.querySelector('.plansvg')!, { clientX: 100, clientY: 100 })

    expect(onRoomSlice).toHaveBeenCalledTimes(1)
    const [roomId, line] = onRoomSlice.mock.calls[0]
    expect(roomId).toBe('AC_001')
    expect(line.angleDeg).toBe(90)
  })

  // 자르기 클릭이 영역 선택(마퀴)으로 먹히면 안 된다.
  it('자르기 모드에서는 배경 드래그가 마퀴 선택을 시작하지 않는다', () => {
    const onSelectionChange = vi.fn()
    const { container } = sliceHarness({ onSelectionChange })
    fireEvent.keyDown(window, { key: 'v' })

    const svg = container.querySelector('.plansvg')!
    fireEvent.mouseDown(svg, { clientX: 900, clientY: 900 }) // 실 밖
    fireEvent.mouseMove(window, { clientX: 950, clientY: 950 })
    fireEvent.mouseUp(window)

    expect(container.querySelector('[stroke-dasharray="4 3"]')).toBeNull() // 마퀴 사각형 없음
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('자르기가 허용되지 않는 단계면 모드로 들어가지 않고 이유를 알린다', () => {
    const onSliceUnavailable = vi.fn()
    sliceHarness({ canSliceRooms: false, onSliceUnavailable })

    fireEvent.keyDown(window, { key: 'v' })

    expect(onSliceUnavailable).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('실 자르기')).toBeNull() // 도구바는 그대로
  })
})

describe('Viewer 실 병합(M)', () => {
  // 좌·우로 나란한 두 실. 클릭 x좌표로 서로 다른 실을 맞힌다.
  const TWO_ROOMS: Record<string, Room> = {
    AC_A: { name: '거실A', floor: '지상1층', usage: '거실', area: 10, type: '4WAY', cool: 5, shortSideM: 3, longSideM: 3, sys: 'EHP', points: rectPoints(24, 24, 300, 420) },
    AC_B: { name: '거실B', floor: '지상1층', usage: '거실', area: 10, type: '4WAY', cool: 5, shortSideM: 3, longSideM: 3, sys: 'EHP', points: rectPoints(360, 24, 300, 420) },
  }
  const mergeHarness = (over: Partial<React.ComponentProps<typeof Viewer>> = {}) =>
    render(
      <Viewer
        rooms={TWO_ROOMS}
        selectedIds={[]}
        onSelectionChange={() => {}}
        indoorSymbols={[]}
        outdoorSymbols={[]}
        canMergeRooms
        isAdjacent={() => true}
        {...over}
      />,
    )
  const svgOf = (c: HTMLElement) => c.querySelector('.plansvg')!

  it('M을 누르면 도구바가 실 병합으로 바뀐다', () => {
    mergeHarness()
    fireEvent.keyDown(window, { key: 'm' })
    expect(screen.getByText('실 병합 · 합칠 두 실을 차례로 클릭하세요')).toBeInTheDocument()
  })

  it('첫 클릭으로 실을 잡고 두 번째(다른 실) 클릭에서 onRoomsMerge를 부른다', () => {
    const onRoomsMerge = vi.fn()
    const { container } = mergeHarness({ onRoomsMerge })
    fireEvent.keyDown(window, { key: 'm' })

    fireEvent.mouseDown(svgOf(container), { clientX: 100, clientY: 100 }) // AC_A
    expect(onRoomsMerge).not.toHaveBeenCalled() // 첫 클릭은 잡기만
    expect(screen.getByText(/실 병합 · 거실A/)).toBeInTheDocument() // HUD가 첫 실을 표시

    fireEvent.mouseDown(svgOf(container), { clientX: 480, clientY: 100 }) // AC_B
    expect(onRoomsMerge).toHaveBeenCalledWith('AC_A', 'AC_B')
  })

  it('같은 실을 다시 누르면 선택을 해제한다(onRoomsMerge 안 부름)', () => {
    const onRoomsMerge = vi.fn()
    const { container } = mergeHarness({ onRoomsMerge })
    fireEvent.keyDown(window, { key: 'm' })

    fireEvent.mouseDown(svgOf(container), { clientX: 100, clientY: 100 }) // AC_A 잡기
    fireEvent.mouseDown(svgOf(container), { clientX: 100, clientY: 100 }) // 같은 실 다시 → 해제

    expect(onRoomsMerge).not.toHaveBeenCalled()
    expect(screen.getByText('실 병합 · 합칠 두 실을 차례로 클릭하세요')).toBeInTheDocument() // 초기 문구로 복귀
  })

  it('병합이 허용되지 않는 단계면 모드로 들어가지 않고 이유를 알린다', () => {
    const onMergeUnavailable = vi.fn()
    mergeHarness({ canMergeRooms: false, onMergeUnavailable })

    fireEvent.keyDown(window, { key: 'm' })

    expect(onMergeUnavailable).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/실 병합 · 합칠/)).toBeNull()
  })
})

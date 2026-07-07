/** @vitest-environment jsdom */
// Viewer 상호작용 회귀 테스트(양방향 선택 동기화).
import { describe, it, expect } from 'vitest'
import { createRef, useState } from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Viewer, { type ViewerHandle } from './Viewer'
import type { Room } from '../data'

// 자유 추가 심볼은 뷰 중앙에 생성되므로, 도면 전체를 덮는 큰 실 하나로 '같은 존' 상황을 만든다.
const ROOMS_FX: Record<string, Room> = {
  AC_001: { name: '거실', area: 31.89, type: '4WAY', cool: 11.2, sys: 'EHP', x: 24, y: 24, w: 680, h: 420 },
}

function Harness({ handleRef }: { handleRef: React.RefObject<ViewerHandle> }) {
  const [sel, setSel] = useState<string[]>([])
  return (
    <>
      <div data-testid="sel-rooms">{sel.join(',')}</div>
      <button data-testid="select-room" onClick={() => setSel(['AC_001'])}>실선택</button>
      <Viewer ref={handleRef} rooms={ROOMS_FX} selectedIds={sel} onSelectionChange={setSel} canAddUnit />
    </>
  )
}

describe('Viewer 선택 동기화', () => {
  it('자유 추가 실내기를 클릭해도 같은 존의 바인딩 실내기가 함께 선택되지 않는다 (회귀)', () => {
    const ref = createRef<ViewerHandle>()
    const { container } = render(<Harness handleRef={ref} />)
    act(() => ref.current!.placeUnits())
    fireEvent.click(screen.getByRole('button', { name: '＋ 실내기' }))
    fireEvent.click(screen.getByRole('button', { name: '4WAY' })) // 유형 선택 후 추가

    const free = container.querySelector('[data-unit-id^="IDU_"]')
    expect(free).not.toBeNull()
    fireEvent.mouseDown(free!)

    // 클릭한 자유 심볼만 선택되고, 같은 존의 기존 심볼(AC_001)은 선택되지 않는다.
    expect(free).toHaveAttribute('data-selected', 'true')
    expect(container.querySelector('[data-unit-id="AC_001"]')).not.toHaveAttribute('data-selected')
    // 순방향 동기화는 유지: 자유 심볼이 놓인 실이 패널 선택으로 올라간다.
    expect(screen.getByTestId('sel-rooms').textContent).toBe('AC_001')
  })

  it('＋ 실내기를 누르면 유형 메뉴가 뜨고, 선택한 유형(2WAY)으로 심볼이 추가된다', () => {
    const ref = createRef<ViewerHandle>()
    const { container } = render(<Harness handleRef={ref} />)
    act(() => ref.current!.placeUnits())

    // 버튼 클릭만으로는 추가되지 않고 유형 메뉴가 열린다.
    fireEvent.click(screen.getByRole('button', { name: '＋ 실내기' }))
    expect(container.querySelector('[data-unit-id^="IDU_"]')).toBeNull()
    expect(screen.getByRole('button', { name: '벽걸이형' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2WAY' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '4WAY' })).toBeInTheDocument()

    // 유형을 고르면 그 유형 라벨을 단 심볼이 추가된다.
    fireEvent.click(screen.getByRole('button', { name: '2WAY' }))
    const free = container.querySelector('[data-unit-id^="IDU_"]')
    expect(free).not.toBeNull()
    expect(free!.textContent).toContain('2WAY · IDU_')
  })

  it('실내기를 드래그해 다른 실로 옮기면 옮겨진 실이 하이라이팅(선택)된다', () => {
    // 좌우로 나란한 두 실. 심볼은 실 중심(스냅 좌표)에 배치된다.
    const rooms: Record<string, Room> = {
      AC_001: { name: '거실', area: 20, type: '4WAY', cool: 9, sys: 'EHP', x: 0, y: 0, w: 200, h: 200 },
      AC_002: { name: '침실', area: 20, type: '4WAY', cool: 5.6, sys: 'EHP', x: 300, y: 0, w: 200, h: 200 },
    }
    const ref = createRef<ViewerHandle>()
    const Two = () => {
      const [sel, setSel] = useState<string[]>([])
      return (
        <>
          <div data-testid="sel-rooms">{sel.join(',')}</div>
          <Viewer ref={ref} rooms={rooms} selectedIds={sel} onSelectionChange={setSel} />
        </>
      )
    }
    const { container } = render(<Two />)
    act(() => ref.current!.placeUnits())

    // AC_001 심볼(중심 100,100)을 잡아 AC_002 중심(400,100)으로 드래그.
    const body = container.querySelector('[data-unit-id="AC_001"] > g')
    expect(body).not.toBeNull()
    fireEvent.mouseDown(body!, { clientX: 100, clientY: 100 })
    fireEvent.mouseMove(window, { clientX: 400, clientY: 100 })
    fireEvent.mouseUp(window)

    expect(screen.getByTestId('sel-rooms').textContent).toBe('AC_002')
  })

  it('패널에서 실을 선택하면 그 실의 바인딩 실내기 심볼이 선택된다 (역방향 동기화 유지)', () => {
    const ref = createRef<ViewerHandle>()
    const { container } = render(<Harness handleRef={ref} />)
    act(() => ref.current!.placeUnits())

    fireEvent.click(screen.getByTestId('select-room'))
    expect(container.querySelector('[data-unit-id="AC_001"]')).toHaveAttribute('data-selected', 'true')
  })
})

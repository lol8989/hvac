/** @vitest-environment jsdom */
// App 스모크: 4단계 파이프라인 진행 + 장비선정표 '새 창' 열기·동기화 회귀 확인.
// (실 검출은 스텝이 아니라 초기 상태 — 도면을 열면 실이 이미 검출돼 있다.)
// (선정표는 스텝이 아니라 새 창 — 도면을 가리지 않고 확인·조정, BroadcastChannel 연동)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'
import { SELECTION_CHANNEL } from './presentation/generation/selectionSync'
import type { SelectionSnapshotMsg } from './presentation/generation/selectionSync'

const dropPayload = (id: string, from: string) => ({
  dataTransfer: {
    getData: () => JSON.stringify({ id, from }),
    setData: () => {},
  },
})

// 심볼을 도면 좌표 target으로 끌어다 놓는다(jsdom의 화면↔SVG 변환은 항등 스텁).
const dragUnitTo = (container: HTMLElement, unitId: string, target: { x: number; y: number }) => {
  const el = container.querySelector(`[data-unit-id="${unitId}"]`)!
  const [ox, oy] = /translate\(([-\d.]+), ([-\d.]+)\)/.exec(el.getAttribute('transform')!)!.slice(1).map(Number)
  fireEvent.mouseDown(el.querySelector('g')!, { clientX: ox, clientY: oy })
  fireEvent.mouseMove(window, { clientX: target.x, clientY: target.y })
  fireEvent.mouseUp(window)
}

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

// 실내기 배치(초기 스텝) → 실외기 선정·조합 단계까지.
// 순서 근거: 실내기를 다 배치해야 정격이 확정되고, 그래야 실외기를 고를 수 있다.
const progressToCombine = () => {
  fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
  fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' })) // 편집 도구 자유 전환(가드 없음)
}

// 조합 → 실외기 배치(도면에 심벌) → 편집 확정 → 산출물.
// jsdom에는 타일(도면 축척)이 없어 이격거리를 잴 수 없다 → '검사하지 못했다' 확인을 한 번 받는다.
const progressToOutput = () => {
  fireEvent.click(screen.getByRole('button', { name: '실외기 배치' })) // 실외기 배치 도구로 전환
  fireEvent.click(screen.getByRole('button', { name: '＋ 실외기 배치' }))
  fireEvent.click(screen.getByRole('button', { name: '✓ 편집 확정' })) // 편집 확정 → 산출물
  fireEvent.click(screen.getByRole('button', { name: '계속 진행' }))
}

describe('App — 초기 상태 (실 검출 완료)', () => {
  // 실 검출을 스텝에서 뺐다 — 도면을 열면 실이 이미 잡혀 있고 첫 스텝은 실내기 배치다.
  it('도면을 열면 실이 이미 검출돼 있고 실내기 배치 단계로 시작한다', () => {
    const { container } = render(<App />)
    // 실이 이미 있다: 리포트에 6실, 도면에 실명이 뜬다.
    expect(container.querySelector('.statusbar')!.textContent).toContain('실내기 배정 0/6')
    expect(container.querySelector('.plansvg')!.textContent).toContain('거실')
    // 첫 스텝은 실내기 배치 — AI 배치 버튼과 시설군 선택이 보인다.
    expect(screen.getByRole('button', { name: '✦ AI 실내기 배치' })).toBeInTheDocument()
    expect(screen.getByLabelText('시설군')).toBeInTheDocument()
  })
})

describe('App — 편집 모드 · 편집 확정 가드', () => {
  // 2페이즈 편집 모드(2026-07-21): 편집 도구는 순서 강제 없이 자유롭게 오간다.
  // 전제 검사(실내기 없는 실 등)는 스텝 전환이 아니라 '편집 확정' 시점에 일괄로 한다.
  it('편집 도구는 가드 팝업 없이 자유롭게 전환된다', () => {
    render(<App />)
    // 실내기 배치 전이라도 '실외기 선정·조합' 도구로 바로 전환된다(팝업 없음).
    fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '실외기 조합 매핑' })).toBeInTheDocument()
  })

  it('미배정이 남은 채 다음 단계로 가려 하면 차단하고 이동하지 않는다', () => {
    const { container } = render(<App />)
    progressToCombine()
    // 선정으로 전 실이 배정된 상태 → 매핑 팝업에서 한 실을 미배정 풀로 되돌린다.
    fireEvent.click(screen.getByRole('button', { name: '실외기 조합 매핑' }))
    // 도크의 편집은 즉시 반영된다(별도 '적용' 버튼이 없다).
    fireEvent.drop(container.querySelector('.pool .pbody')!, dropPayload('AC_002', 'ODU1'))

    fireEvent.click(screen.getByRole('button', { name: '✓ 편집 확정' })) // 편집 확정 시 미배정 실을 잡아낸다
    expect(screen.getByRole('alertdialog', { name: '배정되지 않은 실이 있습니다' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    // 단계는 그대로(조합 매핑 버튼이 여전히 보인다)
    expect(screen.getByRole('button', { name: '실외기 조합 매핑' })).toBeInTheDocument()
  })

  it('조합 매핑은 하단 도크로 열리고 도면은 그대로 보인다', () => {
    const { container } = render(<App />)
    progressToCombine()
    fireEvent.click(screen.getByRole('button', { name: '실외기 조합 매핑' }))

    expect(container.querySelector('.mapdock')).not.toBeNull()
    expect(container.querySelector('.plansvg')).not.toBeNull() // 도면이 살아 있다
    expect(container.querySelector('.overlay')).toBeNull() // 전체화면 딤이 없다
  })

  it('실외기를 도면에 안 놓고 산출물로 가려 하면 몇 대 중 몇 대인지 알려준다', () => {
    render(<App />)
    progressToCombine()
    fireEvent.click(screen.getByRole('button', { name: '✓ 편집 확정' })) // 실외기 미배치라 편집 확정이 차단된다

    expect(screen.getByRole('alertdialog', { name: '실외기를 도면에 배치해야 합니다' })).toBeInTheDocument()
    expect(screen.getByText(/1대 중 0대/)).toBeInTheDocument()
  })

  // 위치가 소속을 정한다(주인님 결정 2026-07-23, 안 a): 심볼을 다른 실 안에 놓으면 대수가 옮겨간다.
  it('실내기 심볼을 다른 실 안으로 끌어다 놓으면 그 실의 대수가 된다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    const count = (roomId: string) => container.querySelectorAll(`[data-unit-id^="${roomId}#"]`).length
    const before = { a: count('AC_001'), b: count('AC_002') }
    expect(before.a).toBeGreaterThan(0)

    // 침실1(AC_002 = rect(296,24,158,135)) 중앙으로 옮긴다.
    dragUnitTo(container, 'AC_001#1', { x: 375, y: 91 })

    expect(count('AC_001')).toBe(before.a - 1) // 원래 실에서 빠지고
    expect(count('AC_002')).toBe(before.b + 1) // 놓인 실로 들어간다
  })

  // 실 간 이동은 사용자 편집 1회다 — Ctrl+Z 한 번으로 두 실이 함께 되돌아와야 한다(§5.7 원자성).
  it('실 간 이동은 Ctrl+Z 한 번으로 두 실이 함께 되돌아온다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    const count = (roomId: string) => container.querySelectorAll(`[data-unit-id^="${roomId}#"]`).length
    const before = { a: count('AC_001'), b: count('AC_002') }

    dragUnitTo(container, 'AC_001#1', { x: 375, y: 91 }) // 거실 → 침실1
    expect(count('AC_001')).toBe(before.a - 1)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(count('AC_001')).toBe(before.a)
    expect(count('AC_002')).toBe(before.b)
  })

  // 마지막 한 대까지 옮기면 그 실은 실내기가 없는 실이 된다 — 터지지 않고 그 상태가 그대로 보여야 한다.
  it('마지막 한 대까지 옮기면 원래 실에 심볼이 남지 않는다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    const count = (roomId: string) => container.querySelectorAll(`[data-unit-id^="${roomId}#"]`).length
    const moved = count('AC_006') // 탕비실
    expect(moved).toBeGreaterThan(0)

    // 탕비실(622,159,74,187) → 로비(283,159,339,187) 중앙으로 한 대씩. 옮길 때마다 id가 앞으로 밀린다.
    for (let i = 0; i < moved; i++) dragUnitTo(container, 'AC_006#1', { x: 452, y: 252 })

    expect(count('AC_006')).toBe(0)
    expect(container.querySelector('.plansvg')!.textContent).toContain('탕비실') // 실 자체는 남는다
  })

  // 심볼 1개 = 실내기 1대 = 선정표 대수 1인데, 심볼을 실 밖으로 끌어내도 소속은 안 바뀐다.
  // 표는 '거실 N대'라 말하고 도면은 거실 밖에 찍는다 — 확정 전에 알려야 한다.
  it('실내기 심볼을 실 밖으로 끌어내면 편집 확정 때 알린다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    // 거실(AC_001, y 24~159) 심볼을 아래로 400 끌어내려 어느 실에도 없는 곳에 놓는다.
    const body = container.querySelector('[data-unit-id="AC_001#1"] > g')!
    fireEvent.mouseDown(body, { clientX: 0, clientY: 0 })
    fireEvent.mouseMove(window, { clientX: 0, clientY: 400 })
    fireEvent.mouseUp(window)

    // 조합·배치 전제를 채운 뒤 확정 → 실 밖 심볼이 확인 항목으로 올라온다.
    fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' }))
    fireEvent.click(screen.getByRole('button', { name: '실외기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ 실외기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '✓ 편집 확정' }))

    expect(screen.getByText(/거실 1번째 대수가 실 밖에 있습니다/)).toBeInTheDocument()
  })

  // 검사하지 못한 것을 '이상 없음'으로 통과시키면 안 된다(false-green).
  it('도면 축척을 몰라 이격을 못 쟀으면 통과시키지 않고 확인을 받는다', () => {
    render(<App />)
    progressToCombine()
    fireEvent.click(screen.getByRole('button', { name: '실외기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ 실외기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '✓ 편집 확정' }))

    expect(screen.getByRole('alertdialog', { name: '이격거리를 검사하지 못했습니다' })).toBeInTheDocument()
    expect(screen.getByText(/도면 축척\(mm\) 정보가 없어/)).toBeInTheDocument()
    // 막지는 않는다 — 확인하면 산출물로 넘어간다(§3 CTA 정책).
    fireEvent.click(screen.getByRole('button', { name: '계속 진행' }))
    expect(screen.getByRole('button', { name: /장비선정표·도면 생성/ })).toBeInTheDocument()
  })

  it('배치 후 시설군을 바꾸면 무엇을 잃는지 확인을 받는다', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' })) // 배치가 생긴다
    // 시설군을 바꾸면 실이 다시 시딩되고 배치·조합이 초기화된다 → 확인을 받는다.
    fireEvent.change(screen.getByLabelText('시설군'), { target: { value: '주거시설' } })

    expect(screen.getByRole('alertdialog', { name: '시설군을 바꿉니다' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '시설군 변경' })).toBeInTheDocument()
  })
})

describe('App — 선정표 새 창 플로우', () => {

  it("'⧉ 선정표 확인'은 ?view=selection 새 창을 연다 (도면을 가리지 않음)", () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container } = render(<App />)
    progressToCombine()
    fireEvent.click(screen.getByRole('button', { name: '⧉ 선정표 확인' }))
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('view=selection'), 'poc-selection-window', expect.any(String))
    // 도면 뷰어는 그대로 표시된다(선정표가 화면을 덮지 않음).
    expect(container.querySelector('.stage')).not.toBeNull()
    openSpy.mockRestore()
  })

  it('실외기 배치까지 마치면 산출물 단계에서 생성·선정표 확인 버튼이 노출된다', () => {
    render(<App />)
    progressToCombine()
    progressToOutput()
    expect(screen.getByRole('button', { name: /장비선정표·도면 생성/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '⧉ 선정표 확인' })).toBeInTheDocument()
  })

  it('새 창의 hello에 스냅샷으로 응답하고, rename 편집 커맨드가 상태에 반영되어 재방송된다', () => {
    render(<App />)
    progressToCombine()

    // 새 창 역할의 테스트 채널 접속.
    const win = new FakeBroadcastChannel(SELECTION_CHANNEL)
    const received: SelectionSnapshotMsg[] = []
    win.onmessage = (e) => { const d = e.data as SelectionSnapshotMsg; if (d?.type === 'table') received.push(d) }

    act(() => win.postMessage({ type: 'hello' }))
    expect(received.length).toBeGreaterThan(0)
    const first = received[received.length - 1]
    expect(first.table.floors[0].rows.map((r) => r.roomName)).toContain('거실')
    expect(first.indoorModelOptions.length).toBeGreaterThan(0)

    // 새 창에서 실명 편집 → 메인 상태 반영 → 갱신 스냅샷 재방송.
    act(() => win.postMessage({ type: 'edit', op: 'rename', roomId: 'AC_001', name: '대회의실' }))
    const last = received[received.length - 1]
    expect(last.table.floors[0].rows.map((r) => r.roomName)).toContain('대회의실')
    win.close()
  })
})

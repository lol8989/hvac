/** @vitest-environment jsdom */
// App 스모크: 4단계 파이프라인 진행 + 장비선정표 '새 창' 열기·동기화 회귀 확인.
// (실 검출은 스텝이 아니라 초기 상태 — 도면을 열면 실이 이미 검출돼 있다.)
// (선정표는 스텝이 아니라 새 창 — 도면을 가리지 않고 확인·조정, BroadcastChannel 연동)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
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

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

// 실내기 배치(초기 스텝) → 실외기 선정·조합 단계까지.
// 순서 근거: 실내기를 다 배치해야 정격이 확정되고, 그래야 실외기를 고를 수 있다.
const progressToCombine = () => {
  fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
  fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
}

// 조합 → 실외기 배치(도면에 심벌) → 산출물.
const progressToOutput = () => {
  fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
  fireEvent.click(screen.getByRole('button', { name: '＋ 실외기 배치' }))
  fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
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

describe('App — 스텝 가드', () => {
  // 주인님 지시 2026-07-16: 실내기 없는 실은 막지 말고 주의만 하고 넘어갈 수 있게 한다.
  it('실내기를 배치하지 않고 실외기 선정으로 가려 하면 주의 팝업이 뜨지만 계속 진행할 수 있다', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))

    const dialog = screen.getByRole('alertdialog', { name: '실내기가 없는 실이 있습니다' })
    expect(within(dialog).getByText(/거실/)).toBeInTheDocument() // 어느 실이 비었는지
    expect(within(dialog).getByText(/제외/)).toBeInTheDocument() // 진행하면 무엇을 잃는지
    // 차단이 아니라 주의 — '계속 진행'으로 넘어갈 수 있다.
    fireEvent.click(screen.getByRole('button', { name: '계속 진행' }))
    // 실외기 선정·조합 단계로 넘어갔다(조합 매핑 버튼이 보인다).
    expect(screen.getByRole('button', { name: '실외기 조합 매핑' })).toBeInTheDocument()
  })

  it('미배정이 남은 채 다음 단계로 가려 하면 차단하고 이동하지 않는다', () => {
    const { container } = render(<App />)
    progressToCombine()
    // 선정으로 전 실이 배정된 상태 → 매핑 팝업에서 한 실을 미배정 풀로 되돌린다.
    fireEvent.click(screen.getByRole('button', { name: '실외기 조합 매핑' }))
    // 도크의 편집은 즉시 반영된다(별도 '적용' 버튼이 없다).
    fireEvent.drop(container.querySelector('.pool .pbody')!, dropPayload('AC_002', 'ODU1'))

    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
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
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))

    expect(screen.getByRole('alertdialog', { name: '실외기를 도면에 배치해야 합니다' })).toBeInTheDocument()
    expect(screen.getByText(/1대 중 0대/)).toBeInTheDocument()
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

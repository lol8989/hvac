/** @vitest-environment jsdom */
// App 스모크: 5단계 파이프라인 진행 + 장비선정표 '새 창' 열기·동기화 회귀 확인.
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

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

// 검출→배치→미세조정→조합(+AC_002 배정)까지 공통 진행 헬퍼.
const progressToCombine = (container: HTMLElement) => {
  fireEvent.click(screen.getByRole('button', { name: '실 검출 실행 →' }))
  fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
  fireEvent.click(screen.getByRole('button', { name: '미세조정 →' }))
  fireEvent.click(screen.getByRole('button', { name: '미세조정 완료 →' }))
  fireEvent.click(screen.getByRole('button', { name: '실외기 조합 매핑' }))
  const dropZones = container.querySelectorAll('.odu .drop')
  fireEvent.drop(dropZones[0], dropPayload('AC_002', 'pool'))
  fireEvent.click(screen.getByRole('button', { name: '조합 적용' }))
}

describe('App — 선정표 새 창 플로우', () => {
  it('미배정이 남은 채 산출물로 가려 하면 토스트로 안내하고 이동하지 않는다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '실 검출 실행 →' }))
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '미세조정 →' }))
    fireEvent.click(screen.getByRole('button', { name: '미세조정 완료 →' }))
    // 자동 조합으로 전 실이 배정된 상태 → 매핑 팝업에서 한 실을 미배정 풀로 되돌려 미배정을 만든다.
    fireEvent.click(screen.getByRole('button', { name: '실외기 조합 매핑' }))
    fireEvent.drop(container.querySelector('.pool .pbody')!, dropPayload('AC_002', 'ODU2'))
    fireEvent.click(screen.getByRole('button', { name: '조합 적용' }))
    fireEvent.click(screen.getByRole('button', { name: '산출물로 →' }))
    expect(screen.getByText(/미배정 실내기 1개가 남아 있습니다/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /장비선정표·도면 생성/ })).not.toBeInTheDocument()
  })

  it("'⧉ 선정표 확인'은 ?view=selection 새 창을 연다 (도면을 가리지 않음)", () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const { container } = render(<App />)
    progressToCombine(container)
    fireEvent.click(screen.getByRole('button', { name: '⧉ 선정표 확인' }))
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('view=selection'), 'poc-selection-window', expect.any(String))
    // 도면 뷰어는 그대로 표시된다(선정표가 화면을 덮지 않음).
    expect(container.querySelector('.stage')).not.toBeNull()
    openSpy.mockRestore()
  })

  it('조합 완료 후 산출물 단계로 가면 생성·선정표 확인 버튼이 노출된다', () => {
    const { container } = render(<App />)
    progressToCombine(container)
    fireEvent.click(screen.getByRole('button', { name: '산출물로 →' }))
    expect(screen.getByRole('button', { name: /장비선정표·도면 생성/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '⧉ 선정표 확인' })).toBeInTheDocument()
  })

  it('새 창의 hello에 스냅샷으로 응답하고, rename 편집 커맨드가 상태에 반영되어 재방송된다', () => {
    const { container } = render(<App />)
    progressToCombine(container)

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

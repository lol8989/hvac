/** @vitest-environment jsdom */
// 되돌리기/다시하기 — 편집(실·형상·배치·조합)을 원자적으로 되돌린다.
// (실 검출은 편집이 아니라 초기 상태다 — 되돌릴 대상은 자르기·병합·배치·조합이다.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

const enterSlice = () => fireEvent.keyDown(window, { key: 'v' })
const slice거실 = (c: HTMLElement) =>
  fireEvent.mouseDown(c.querySelector('.plansvg')!, { clientX: 160, clientY: 91 }) // 거실 한가운데(세로선)
const undo = () => fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
const redo = () => fireEvent.click(screen.getByRole('button', { name: '다시 실행' }))
// 실명은 도면 라벨(ZoneRect)에서, 실 수는 하단 리포트의 '배정 x/N'에서 관찰한다.
const planText = (c: HTMLElement) => c.querySelector('.plansvg')!.textContent ?? ''
const statusText = (c: HTMLElement) => c.querySelector('.statusbar')!.textContent ?? ''

describe('App — 되돌리기/다시하기', () => {
  it('편집 전에는 되돌릴 것도 다시 할 것도 없다', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeDisabled()
  })

  // 자르기는 실·형상·배치를 한꺼번에 바꾼다 → 한 번의 Ctrl+Z로 전부 돌아와야 한다.
  it('실 자르기를 되돌리면 실이 하나로 합쳐진다(원자적)', () => {
    const { container } = render(<App />)
    enterSlice()
    slice거실(container)

    expect(statusText(container)).toContain('/7')
    expect(planText(container)).toContain('거실-1')

    undo()
    expect(statusText(container)).toContain('/6')
    expect(planText(container)).not.toContain('거실-1')
    expect(planText(container)).toContain('거실') // 부모 실이 복원된다

    redo()
    expect(statusText(container)).toContain('/7')
  })

  it('Ctrl+Z / Ctrl+Shift+Z 단축키로도 되돌리고 다시 실행한다', () => {
    const { container } = render(<App />)
    enterSlice()
    slice거실(container)
    expect(statusText(container)).toContain('/7')

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(statusText(container)).toContain('/6')

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(statusText(container)).toContain('/7')
  })

  it('AI 실내기 배치를 되돌리면 심볼과 대수가 함께 사라진다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    expect(container.querySelectorAll('[data-unit-id]').length).toBeGreaterThan(0)
    expect(statusText(container)).toContain('미배정 6')

    undo()
    expect(container.querySelectorAll('[data-unit-id]')).toHaveLength(0)
    expect(statusText(container)).toContain('미배정 0')
  })

  it('되돌린 뒤 새로 편집하면 다시 실행할 것이 없어진다', () => {
    const { container } = render(<App />)
    enterSlice()
    slice거실(container)
    undo()
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' })) // 새 편집
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeDisabled()
  })

  // 파생 동기화(플랜 재계산)가 히스토리를 쌓으면 Ctrl+Z가 사용자가 한 적 없는 일을 되돌린다.
  it('되돌리기 한 번이 사용자의 편집 한 건을 되돌린다(파생 동기화를 세지 않는다)', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    undo() // AI 배치만 되돌린다
    expect(statusText(container)).toContain('실내기 배정 0/6') // 실은 살아 있다(검출은 초기 상태)
    expect(container.querySelectorAll('[data-unit-id]')).toHaveLength(0)
  })

  it('입력 필드에 포커스가 있으면 Ctrl+Z가 편집을 되돌리지 않는다', () => {
    const { container } = render(<App />)
    enterSlice()
    slice거실(container)
    expect(statusText(container)).toContain('/7')

    const select = screen.getByLabelText('시설군')
    fireEvent.keyDown(select, { key: 'z', ctrlKey: true })
    expect(statusText(container)).toContain('/7') // 그대로(되돌려지지 않음)
  })
})

/** @vitest-environment jsdom */
// 되돌리기/다시하기 — 편집(실·형상·배치·조합)을 원자적으로 되돌린다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

const detect = () => fireEvent.click(screen.getByRole('button', { name: '✦ 실 검출 실행' }))
const undo = () => fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
const redo = () => fireEvent.click(screen.getByRole('button', { name: '다시 실행' }))
const panelText = (c: HTMLElement) => c.querySelector('.rpanel')!.textContent ?? ''
const statusText = (c: HTMLElement) => c.querySelector('.statusbar')!.textContent ?? ''

describe('App — 되돌리기/다시하기', () => {
  it('편집 전에는 되돌릴 것도 다시 할 것도 없다', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeDisabled()
  })

  it('실 검출을 되돌리면 검출 전으로 돌아간다', () => {
    const { container } = render(<App />)
    detect()
    expect(panelText(container)).toContain('6곳')

    undo()
    expect(panelText(container)).toContain('아직 검출된 실이 없습니다')

    redo()
    expect(panelText(container)).toContain('6곳')
  })

  // 자르기는 실·형상·배치를 한꺼번에 바꾼다 → 한 번의 Ctrl+Z로 전부 돌아와야 한다.
  it('실 자르기를 되돌리면 실이 하나로 합쳐진다(원자적)', () => {
    const { container } = render(<App />)
    detect()
    fireEvent.keyDown(window, { key: 'v' })
    fireEvent.mouseDown(container.querySelector('.plansvg')!, { clientX: 160, clientY: 91 }) // 거실 한가운데

    expect(panelText(container)).toContain('7곳')
    expect(panelText(container)).toContain('거실-1')

    undo()
    expect(panelText(container)).toContain('6곳')
    expect(panelText(container)).not.toContain('거실-1')
    expect(panelText(container)).toContain('AC_001 · 거실')

    redo()
    expect(panelText(container)).toContain('7곳')
  })

  it('Ctrl+Z / Ctrl+Shift+Z 단축키로도 되돌리고 다시 실행한다', () => {
    const { container } = render(<App />)
    detect()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(panelText(container)).toContain('아직 검출된 실이 없습니다')

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(panelText(container)).toContain('6곳')
  })

  it('AI 실내기 배치를 되돌리면 심볼과 대수가 함께 사라진다', () => {
    const { container } = render(<App />)
    detect()
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    expect(container.querySelectorAll('[data-unit-id]').length).toBeGreaterThan(0)
    expect(statusText(container)).toContain('미배정 6')

    undo()
    expect(container.querySelectorAll('[data-unit-id]')).toHaveLength(0)
    expect(statusText(container)).toContain('미배정 0')
  })

  it('되돌린 뒤 새로 편집하면 다시 실행할 것이 없어진다', () => {
    render(<App />)
    detect()
    undo()
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeEnabled()

    detect() // 새 편집
    expect(screen.getByRole('button', { name: '다시 실행' })).toBeDisabled()
  })

  // 파생 동기화(플랜 재계산)가 히스토리를 쌓으면 Ctrl+Z가 사용자가 한 적 없는 일을 되돌린다.
  it('되돌리기 한 번이 사용자의 편집 한 건을 되돌린다(파생 동기화를 세지 않는다)', () => {
    const { container } = render(<App />)
    detect()
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    undo() // AI 배치만 되돌린다
    expect(panelText(container)).not.toContain('아직 검출된 실이 없습니다') // 검출은 살아 있다
    expect(container.querySelectorAll('[data-unit-id]')).toHaveLength(0)
  })

  it('입력 필드에 포커스가 있으면 Ctrl+Z가 편집을 되돌리지 않는다', () => {
    const { container } = render(<App />)
    detect()
    const select = screen.getByLabelText('시설군')
    fireEvent.keyDown(select, { key: 'z', ctrlKey: true })
    expect(panelText(container)).toContain('6곳') // 그대로
  })
})

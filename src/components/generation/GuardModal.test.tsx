/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GuardModal from './GuardModal'
import type { GuardVerdict } from '../../domain/generation/StepGuard'

const BLOCK: Extract<GuardVerdict, { kind: 'BLOCK' }> = {
  kind: 'BLOCK',
  code: 'OUTDOOR_NOT_PLACED',
  title: '실외기를 도면에 배치해야 합니다',
  reason: '실외기 1대 중 0대만 도면에 배치됐습니다.',
  remedy: "도면에서 '＋ 실외기 배치'를 누르세요.",
}

const CONFIRM: Extract<GuardVerdict, { kind: 'CONFIRM' }> = {
  kind: 'CONFIRM',
  code: 'OVERLOADED',
  title: '조합비가 허용 범위를 넘었습니다',
  reason: '과부하 실외기 1대: 실외기-1',
  detail: '이대로 진행하면 산출물에 과부하가 실립니다.',
}

describe('GuardModal — BLOCK', () => {
  it('사유와 해결법을 모두 보여준다', () => {
    render(<GuardModal verdict={BLOCK} onProceed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(BLOCK.title)).toBeInTheDocument()
    expect(screen.getByText(BLOCK.reason)).toBeInTheDocument()
    expect(screen.getByText(/누르세요/)).toBeInTheDocument() // 해결법(remedy)을 함께 보여준다
  })

  it('진행 버튼이 없다 — 확인 하나뿐', () => {
    render(<GuardModal verdict={BLOCK} onProceed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '계속 진행' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
  })

  it('[적대] 확인을 눌러도 onProceed는 불리지 않는다(차단은 넘길 수 없다)', () => {
    const onProceed = vi.fn()
    const onClose = vi.fn()
    render(<GuardModal verdict={BLOCK} onProceed={onProceed} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(onProceed).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('GuardModal — CONFIRM', () => {
  it('취소와 계속 진행을 모두 제공한다', () => {
    const onProceed = vi.fn()
    const onClose = vi.fn()
    render(<GuardModal verdict={CONFIRM} onProceed={onProceed} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '계속 진행' }))
    expect(onProceed).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('진행 버튼 라벨을 바꿀 수 있다', () => {
    render(<GuardModal verdict={CONFIRM} confirmLabel="그래도 재검출" onProceed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: '그래도 재검출' })).toBeInTheDocument()
  })
})

describe('GuardModal — 닫기 경로', () => {
  it('Esc로 닫는다', () => {
    const onClose = vi.fn()
    render(<GuardModal verdict={CONFIRM} onProceed={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('바깥(딤) 클릭으로 닫는다', () => {
    const onClose = vi.fn()
    const { container } = render(<GuardModal verdict={CONFIRM} onProceed={vi.fn()} onClose={onClose} />)
    fireEvent.mouseDown(container.querySelector('.overlay')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

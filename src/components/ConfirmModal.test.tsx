/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmModal from './ConfirmModal'

describe('ConfirmModal (확인 팝업)', () => {
  it('확인을 누르면 onConfirm이 호출된다', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal title="모델 적용 확인" message="적용합니다" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('취소를 누르면 onCancel만 호출되고 onConfirm은 호출되지 않는다 (이벤트 없음)', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal title="모델 적용 확인" message="적용합니다" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('Esc 키로 닫으면 onCancel이 호출된다', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmModal title="모델 적용 확인" message="적용합니다" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

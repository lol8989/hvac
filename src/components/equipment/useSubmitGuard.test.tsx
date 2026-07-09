/** @vitest-environment jsdom */
// 더블클릭 가드의 계약: 같은 tick 재진입 차단 + 완료 후 잠금 해제.
// StrictMode 회귀: dev의 mount→unmount→remount에서 mounted ref가 false로 굳어 busy가 영구 true가 되면 안 된다.
import { StrictMode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useSubmitGuard } from './useSubmitGuard'

function Probe({ action }: { action: () => void | Promise<void> }) {
  const { busy, run } = useSubmitGuard()
  return (
    <button onClick={() => void run(action)} disabled={busy} data-busy={busy}>
      실행
    </button>
  )
}

const btn = () => screen.getByRole('button', { name: '실행' })

describe('useSubmitGuard (더블클릭 방지)', () => {
  it('같은 tick의 연타에서 액션은 1회만 실행된다', () => {
    const action = vi.fn()
    render(<Probe action={action} />)
    fireEvent.click(btn())
    fireEvent.click(btn())
    fireEvent.click(btn())
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('완료 후에는 잠금이 풀려 다시 실행할 수 있다', async () => {
    const action = vi.fn()
    render(<Probe action={action} />)
    fireEvent.click(btn())
    await act(async () => {})
    fireEvent.click(btn())
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('액션이 던져도 잠금이 해제된다', async () => {
    const action = vi.fn(() => {
      throw new Error('실패')
    })
    render(<Probe action={() => { try { action() } catch { /* 호출측이 처리 */ } }} />)
    fireEvent.click(btn())
    await act(async () => {})
    fireEvent.click(btn())
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('StrictMode에서도 실행 후 busy가 false로 돌아온다(영구 비활성 방지)', async () => {
    const action = vi.fn()
    render(
      <StrictMode>
        <Probe action={action} />
      </StrictMode>,
    )
    fireEvent.click(btn())
    await act(async () => {})
    expect(btn()).toBeEnabled()
    expect(btn()).toHaveAttribute('data-busy', 'false')
    fireEvent.click(btn())
    expect(action).toHaveBeenCalledTimes(2)
  })
})

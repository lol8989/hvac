/** @vitest-environment jsdom */
// 스텝 가드 팝업 — 단일 판정(BLOCK/CONFIRM)과 다중 CONFIRM 병합 안내를 검증한다.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GuardModal from './GuardModal'
import type { GuardVerdict } from '../../domain/generation/StepGuard'

type Confirm = Extract<GuardVerdict, { kind: 'CONFIRM' }>
const confirm = (over: Partial<Confirm>): Confirm => ({
  kind: 'CONFIRM', code: 'OVERLOADED', title: '제목', reason: '사유', detail: '상세', ...over,
})
const block: Extract<GuardVerdict, { kind: 'BLOCK' }> = {
  kind: 'BLOCK', code: 'NO_ROOMS', title: '막힘', reason: '실이 없다', remedy: '도면을 여세요',
}

describe('GuardModal', () => {
  it('BLOCK은 사유·해결법과 확인 버튼만 보여준다(진행 없음)', () => {
    render(<GuardModal verdict={block} onProceed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('막힘')).toBeTruthy()
    expect(screen.getByText('실이 없다')).toBeTruthy()
    expect(screen.getByRole('button', { name: '확인' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '계속 진행' })).toBeNull()
  })

  it('CONFIRM 1건이면 그 사유·상세와 취소/계속 진행을 보여준다', () => {
    render(<GuardModal verdict={confirm({ title: '과부하', reason: '조합비 초과', detail: '교체 권장' })} onProceed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('과부하')).toBeTruthy()
    expect(screen.getByText('조합비 초과')).toBeTruthy()
    expect(screen.getByRole('button', { name: '계속 진행' })).toBeTruthy()
  })

  it('CONFIRM 2건 이상이면 제목을 개수로 요약하고 모든 항목을 목록으로 보여준다', () => {
    const confirms = [
      confirm({ code: 'ROOMS_WITHOUT_INDOOR', title: '실내기 없는 실', reason: '탕비실에 실내기 없음', detail: '산출물에서 제외됨' }),
      confirm({ code: 'OVERLOADED', title: '과부하', reason: '실외기-1 과부하', detail: '더 큰 모델 권장' }),
    ]
    render(<GuardModal verdict={confirms[0]} confirms={confirms} onProceed={vi.fn()} onClose={vi.fn()} />)
    // 첫 개만이 아니라 두 항목 제목·사유가 모두 보인다
    expect(screen.getByText('확인이 필요한 항목 2건')).toBeTruthy()
    expect(screen.getByText('실내기 없는 실')).toBeTruthy()
    expect(screen.getByText('탕비실에 실내기 없음')).toBeTruthy()
    expect(screen.getByText('과부하')).toBeTruthy()
    expect(screen.getByText('실외기-1 과부하')).toBeTruthy()
  })

  it('CONFIRM 병합 시 계속 진행을 누르면 onProceed가 호출된다', () => {
    const onProceed = vi.fn()
    const confirms = [confirm({ code: 'ROOMS_WITHOUT_INDOOR', title: 'A' }), confirm({ code: 'OVERLOADED', title: 'B' })]
    render(<GuardModal verdict={confirms[0]} confirms={confirms} onProceed={onProceed} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '계속 진행' }))
    expect(onProceed).toHaveBeenCalledOnce()
  })

  it('CONFIRM이 1건이면 병합 제목을 쓰지 않는다', () => {
    render(<GuardModal verdict={confirm({ title: '홀로' })} confirms={[confirm({ title: '홀로' })]} onProceed={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText(/확인이 필요한 항목/)).toBeNull()
    expect(screen.getByText('홀로')).toBeTruthy()
  })
})

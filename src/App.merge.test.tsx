/** @vitest-environment jsdom */
// 실 병합(M) 통합 — 붙어 있는 두 실을 하나로. 자르기의 역연산이다.
// 실 검출은 스텝이 아니다 — 도면을 열면 실이 이미 검출돼 있고, 병합은 첫 스텝(실내기 배치)의 도구다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

const enterMerge = () => fireEvent.keyDown(window, { key: 'm' })
const clickPlan = (c: HTMLElement, x: number, y: number) =>
  fireEvent.mouseDown(c.querySelector('.plansvg')!, { clientX: x, clientY: y })
// 실 수는 하단 리포트의 '배정 x/N', 실명·면적은 도면 라벨(ZoneRect)에서 관찰한다.
const statusText = (c: HTMLElement) => c.querySelector('.statusbar')!.textContent ?? ''
const planText = (c: HTMLElement) => c.querySelector('.plansvg')!.textContent ?? ''

// 인접 파티션(data.ts): 거실 24~296 / 침실1 296~454 (y 24~159), 회의실 454~696
const 거실 = { x: 160, y: 91 }
const 침실1 = { x: 375, y: 91 }
const 회의실 = { x: 575, y: 91 }
const 탕비실 = { x: 659, y: 250 }

describe('App — 실 병합', () => {
  it('붙어 있는 두 실을 클릭하면 하나로 합쳐진다(면적 합 보존)', () => {
    const { container } = render(<App />)
    expect(statusText(container)).toContain('/6')

    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 침실1.x, 침실1.y)

    expect(statusText(container)).toContain('/5') // 6 → 5
    expect(planText(container)).toContain('거실+침실1')
    expect(planText(container)).toContain('50.4㎡') // 31.9 + 18.5 (합친 실의 면적)
  })

  it('떨어져 있는 실은 합칠 수 없다', () => {
    const { container } = render(<App />)
    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 회의실.x, 회의실.y) // 거실과 회의실은 사이에 침실1이 있다

    expect(screen.getByText(/붙어 있지 않은 실/)).toBeInTheDocument()
    expect(statusText(container)).toContain('/6') // 안 합쳐졌다
  })

  it('자른 실을 다시 합치면 원래 실이 복원된다(자르기의 역연산)', () => {
    const { container } = render(<App />)

    // 거실을 세로로 자른다
    fireEvent.keyDown(window, { key: 'v' })
    clickPlan(container, 거실.x, 거실.y)
    expect(planText(container)).toContain('거실-1')
    expect(statusText(container)).toContain('/7')

    // 두 조각을 다시 합친다
    enterMerge()
    clickPlan(container, 80, 91) // 거실-1
    clickPlan(container, 240, 91) // 거실-2

    expect(statusText(container)).toContain('/6')
    expect(planText(container)).not.toContain('거실-1') // 자식이 사라지고
    expect(planText(container)).toContain('거실') // 부모 실명 복원
    expect(planText(container)).toContain('31.9㎡') // 부모 면적 복원
  })

  it('실내기가 배치된 두 실을 합치면 심볼이 모두 살아남고 대수가 합쳐진다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    const before = container.querySelectorAll('[data-unit-id]').length
    const 거실대수 = container.querySelectorAll('[data-unit-id^="AC_001#"]').length
    const 침실대수 = container.querySelectorAll('[data-unit-id^="AC_002#"]').length
    expect(거실대수 + 침실대수).toBeGreaterThan(2)

    // 병합은 배치 단계 그대로에서 한다(배치가 있으니 확인 팝업이 뜬다)
    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 침실1.x, 침실1.y)
    fireEvent.click(screen.getByRole('button', { name: '병합' }))

    // 심볼 총수는 그대로, 합친 실 하나가 전부 가진다
    expect(container.querySelectorAll('[data-unit-id]')).toHaveLength(before)
    expect(container.querySelectorAll('[data-unit-id^="AC_002#"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-unit-id^="AC_001#"]')).toHaveLength(거실대수 + 침실대수)
  })

  it('병합을 되돌리면 두 실이 다시 나뉜다', () => {
    const { container } = render(<App />)
    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 침실1.x, 침실1.y)
    expect(statusText(container)).toContain('/5')
    expect(planText(container)).toContain('거실+침실1')

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(statusText(container)).toContain('/6')
    expect(planText(container)).not.toContain('거실+침실1') // 합친 실이 사라지고 두 실이 복원된다
    expect(planText(container)).toContain('침실1')
  })

  it('합친 오목한 실도 다시 자를 수 있다', () => {
    const { container } = render(<App />)
    // 회의실(454~696 × 24~159) + 탕비실(622~696 × 159~346) → ㄱ자
    enterMerge()
    clickPlan(container, 회의실.x, 회의실.y)
    clickPlan(container, 탕비실.x, 탕비실.y)
    expect(statusText(container)).toContain('/5')
    expect(planText(container)).toContain('회의실+탕비실')

    // 그 ㄱ자 실을 세로로 자른다
    fireEvent.keyDown(window, { key: 'v' })
    clickPlan(container, 659, 100)

    expect(statusText(container)).toContain('/6') // 다시 나뉘었다
  })

  it('실내기 배치 단계가 아니면 M은 안내만 한다', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' })) // → 실외기 선정·조합
    enterMerge()
    expect(screen.getByText(/실내기 배치 단계에서만/)).toBeInTheDocument()
  })
})

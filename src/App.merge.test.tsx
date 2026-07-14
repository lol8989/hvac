/** @vitest-environment jsdom */
// 실 병합(M) 통합 — 붙어 있는 두 실을 하나로. 자르기의 역연산이다.
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
const enterMerge = () => fireEvent.keyDown(window, { key: 'm' })
const clickPlan = (c: HTMLElement, x: number, y: number) =>
  fireEvent.mouseDown(c.querySelector('.plansvg')!, { clientX: x, clientY: y })
const panelText = (c: HTMLElement) => c.querySelector('.rpanel')!.textContent ?? ''

// 인접 파티션(data.ts): 거실 24~296 / 침실1 296~454 (y 24~159), 회의실 454~696
const 거실 = { x: 160, y: 91 }
const 침실1 = { x: 375, y: 91 }
const 회의실 = { x: 575, y: 91 }
const 탕비실 = { x: 659, y: 250 }

describe('App — 실 병합', () => {
  it('붙어 있는 두 실을 클릭하면 하나로 합쳐진다(면적 합 보존)', () => {
    const { container } = render(<App />)
    detect()
    expect(panelText(container)).toContain('6곳')

    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 침실1.x, 침실1.y)

    const t = panelText(container)
    expect(t).toContain('5곳') // 6 → 5
    expect(t).toContain('거실+침실1')
    expect(t).toContain('50.4㎡') // 31.89 + 18.5
    expect(t).toContain('187.9㎡') // 총 면적은 그대로
  })

  it('떨어져 있는 실은 합칠 수 없다', () => {
    const { container } = render(<App />)
    detect()
    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 회의실.x, 회의실.y) // 거실과 회의실은 사이에 침실1이 있다

    expect(screen.getByText(/붙어 있지 않은 실/)).toBeInTheDocument()
    expect(panelText(container)).toContain('6곳') // 안 합쳐졌다
  })

  it('자른 실을 다시 합치면 원래 실이 복원된다(자르기의 역연산)', () => {
    const { container } = render(<App />)
    detect()

    // 거실을 세로로 자른다
    fireEvent.keyDown(window, { key: 'v' })
    clickPlan(container, 거실.x, 거실.y)
    expect(panelText(container)).toContain('거실-1')
    expect(panelText(container)).toContain('7곳')

    // 두 조각을 다시 합친다
    enterMerge()
    clickPlan(container, 80, 91) // 거실-1
    clickPlan(container, 240, 91) // 거실-2

    const t = panelText(container)
    expect(t).toContain('6곳')
    expect(t).toContain('AC_001 · 거실') // 부모 id·이름 복원
    expect(t).not.toContain('거실-1')
    expect(t).toContain('31.9㎡')
  })

  it('실내기가 배치된 두 실을 합치면 심볼이 모두 살아남고 대수가 합쳐진다', () => {
    const { container } = render(<App />)
    detect()
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    const before = container.querySelectorAll('[data-unit-id]').length
    const 거실대수 = container.querySelectorAll('[data-unit-id^="AC_001#"]').length
    const 침실대수 = container.querySelectorAll('[data-unit-id^="AC_002#"]').length
    expect(거실대수 + 침실대수).toBeGreaterThan(2)

    // 검출 단계로 돌아가 병합(배치가 있으니 확인 팝업이 뜬다)
    fireEvent.click(screen.getByRole('button', { name: '← 이전' }))
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }))
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
    detect()
    enterMerge()
    clickPlan(container, 거실.x, 거실.y)
    clickPlan(container, 침실1.x, 침실1.y)
    expect(panelText(container)).toContain('5곳')

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    const t = panelText(container)
    expect(t).toContain('6곳')
    expect(t).toContain('AC_001 · 거실')
    expect(t).toContain('AC_002 · 침실1')
  })

  it('합친 오목한 실도 다시 자를 수 있다', () => {
    const { container } = render(<App />)
    detect()
    // 회의실(454~696 × 24~159) + 탕비실(622~696 × 159~346) → ㄱ자
    enterMerge()
    clickPlan(container, 회의실.x, 회의실.y)
    clickPlan(container, 탕비실.x, 탕비실.y)
    expect(panelText(container)).toContain('5곳')
    expect(panelText(container)).toContain('회의실+탕비실')

    // 그 ㄱ자 실을 세로로 자른다
    fireEvent.keyDown(window, { key: 'v' })
    clickPlan(container, 659, 100)

    expect(panelText(container)).toContain('6곳')
    expect(panelText(container)).toContain('187.9㎡') // 총 면적 보존
  })

  it('검출 단계가 아니면 M은 안내만 한다', () => {
    render(<App />)
    detect()
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
    enterMerge()
    expect(screen.getByText(/실 검출 단계에서만/)).toBeInTheDocument()
  })
})

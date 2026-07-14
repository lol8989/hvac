/** @vitest-environment jsdom */
// 실 자르기(V) 통합 — 뷰어 클릭 한 번이 도메인·배치·선정표를 원자적으로 갈아끼운다.
//
// 자를 때 반드시 함께 움직여야 하는 것들:
//  · domainRooms: 부모가 사라지고 자식 2개가 '부모 자리'에 들어온다(선정표 행 순서 유지)
//  · placements : 부모 배치를 지우고 심볼을 위치대로 자식에 나눠 준다(유령 심볼 0)
//  · selRooms   : 사라진 부모 id가 남으면 파생값이 undefined를 받아 터진다
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

const detect = () => fireEvent.click(screen.getByRole('button', { name: '✦ 실 검출 실행' }))
const enterSlice = () => fireEvent.keyDown(window, { key: 'v' })

// 목업 AC_001(거실) = 24,24 ~ 274,174 → 가운데는 (149, 99).
// jsdom에는 레이아웃이 없어 getScreenCTM이 단위행렬이므로 clientX/Y가 곧 도면 좌표다.
const clickPlan = (container: HTMLElement, x: number, y: number) =>
  fireEvent.mouseDown(container.querySelector('.plansvg')!, { clientX: x, clientY: y })

const panelText = (container: HTMLElement) => container.querySelector('.rpanel')!.textContent ?? ''

describe('App — 실 자르기', () => {
  it('실을 자르면 실이 1곳 늘고 두 조각의 면적 합이 원본과 같다', () => {
    const { container } = render(<App />)
    detect()
    expect(panelText(container)).toContain('6곳')

    enterSlice()
    clickPlan(container, 149, 99) // 거실 한가운데를 세로선(90°)으로

    const t = panelText(container)
    expect(t).toContain('7곳') // 6 → 7
    expect(t).toContain('거실-1')
    expect(t).toContain('거실-2')
    expect(t).not.toContain('AC_001 ·') // 부모는 사라졌다
    // 총 면적은 보존된다(잘랐다고 면적이 늘거나 줄지 않는다)
    expect(t).toContain('187.9㎡')
  })

  it('절단선이 실을 가르지 않으면(빈 곳 클릭) 아무 일도 일어나지 않는다', () => {
    const { container } = render(<App />)
    detect()
    enterSlice()
    clickPlan(container, 700, 440) // 실 밖

    expect(panelText(container)).toContain('6곳')
  })

  it('너무 얇게 자르면 거부하고 왜 안 되는지 알린다', () => {
    const { container } = render(<App />)
    detect()
    enterSlice()
    clickPlan(container, 26, 99) // 거실 좌변에서 2px — 조각이 부모의 1% 미만

    expect(screen.getByText(/너무 작습니다/)).toBeInTheDocument()
    expect(panelText(container)).toContain('6곳') // 안 잘렸다
  })

  it('검출 전에는 V가 자르기 모드로 들어가지 않는다', () => {
    render(<App />)
    enterSlice()

    expect(screen.getByText(/실을 먼저 검출해야/)).toBeInTheDocument()
  })

  it('검출 단계가 아니면 V는 안내만 하고 모드로 들어가지 않는다', () => {
    render(<App />)
    detect()
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' })) // place 단계
    enterSlice()

    expect(screen.getByText(/실 검출 단계에서만/)).toBeInTheDocument()
  })

  // 도면이 진실이다 — 심볼 1개 = 실내기 1대 = 선정표 대수 1.
  it('실내기가 배치된 실을 자르면 심볼이 위치대로 나뉘고 유령 심볼이 남지 않는다', () => {
    const { container } = render(<App />)
    detect()
    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' }))
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    // 침실1(AC_002, 292,24 ~ 472,134)에는 2대가 좌우로 놓인다(337,79)·(427,79).
    expect(container.querySelectorAll('[data-unit-id^="AC_002#"]')).toHaveLength(2)

    // 자르려면 검출 단계로 돌아간다(배치가 있으니 확인 팝업이 뜬다).
    fireEvent.click(screen.getByRole('button', { name: '← 이전' }))
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }))
    enterSlice()
    clickPlan(container, 382, 79) // 두 심볼 사이를 세로로
    fireEvent.click(screen.getByRole('button', { name: '자르기' })) // ROOM_SLICE 확인

    // 부모 심볼은 사라지고(유령 없음), 두 자식이 1대씩 나눠 갖는다.
    expect(container.querySelectorAll('[data-unit-id^="AC_002#"]')).toHaveLength(0)
    expect(container.querySelectorAll('[data-unit-id^="AC_002-1#"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-unit-id^="AC_002-2#"]')).toHaveLength(1)
  })

  it('자른 뒤에도 조합 리포트의 실 수가 도메인과 일치한다', () => {
    const { container } = render(<App />)
    detect()
    enterSlice()
    clickPlan(container, 149, 99)

    expect(container.querySelector('.statusbar')!.textContent).toContain('실내기 배정 0/7')
  })

  // ── 적대적 QA 회귀 (2026-07-14) ──

  // [QA #3] 자른 자식 실을 선택한 채 재검출하면 domainRooms[primary]가 undefined가 되어
  // 렌더 중 aiSelectionFor(undefined)가 터졌다 → 흰 화면.
  it('[QA] 자른 실을 선택한 채 재검출해도 죽지 않는다', () => {
    const { container } = render(<App />)
    detect()
    enterSlice()
    clickPlan(container, 149, 99)

    // 자식 실을 선택한다(존 모드에서 클릭).
    fireEvent.keyDown(window, { key: 'z' })
    fireEvent.mouseDown(container.querySelector('polygon')!)

    detect() // 재검출 → 자식 id는 사라진다(배치가 없으니 확인 없이 바로 실행된다)

    expect(panelText(container)).toContain('6곳') // 살아 있다
  })

  // [QA #8] 자르기 모드가 단계를 넘어 유지돼, 실내기 배치 단계에서도 클릭이 실을 잘랐다.
  it('[QA] 다음 단계로 넘어가면 자르기 모드가 풀리고 클릭이 실을 자르지 않는다', () => {
    const { container } = render(<App />)
    detect()
    enterSlice()
    expect(container.querySelector('.slicehud')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '다음 단계 →' })) // place 단계
    expect(container.querySelector('.slicehud')).toBeNull() // 모드가 풀린다

    clickPlan(container, 149, 99)
    expect(container.querySelector('.statusbar')!.textContent).toContain('실내기 배정 0/6') // 여전히 6실
  })

  it('부모 실을 선택한 채 잘라도 크래시하지 않는다(선택이 정리된다)', () => {
    const { container } = render(<App />)
    detect()
    // 존 모드로 실을 클릭해 선택한다.
    fireEvent.keyDown(window, { key: 'z' })
    const zone = container.querySelector('polygon')!
    fireEvent.mouseDown(zone)

    enterSlice()
    clickPlan(container, 149, 99)

    expect(within(container.querySelector('.rpanel') as HTMLElement).getByText('검출된 실')).toBeInTheDocument()
  })
})

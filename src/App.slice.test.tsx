/** @vitest-environment jsdom */
// 실 자르기(V) 통합 — 뷰어 클릭 한 번이 도메인·배치·선정표를 원자적으로 갈아끼운다.
// 실 검출은 스텝이 아니다 — 도면을 열면 실이 이미 검출돼 있고, 자르기는 첫 스텝(실내기 배치)의 도구다.
//
// 자를 때 반드시 함께 움직여야 하는 것들:
//  · domainRooms: 부모가 사라지고 자식 2개가 '부모 자리'에 들어온다(선정표 행 순서 유지)
//  · placements : 부모 배치를 지우고 심볼을 위치대로 자식에 나눠 준다(유령 심볼 0)
//  · selRooms   : 사라진 부모 id가 남으면 파생값이 undefined를 받아 터진다
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

// 목업 AC_001(거실) = 24,24 ~ 274,174 → 가운데는 (149, 99).
// jsdom에는 레이아웃이 없어 getScreenCTM이 단위행렬이므로 clientX/Y가 곧 도면 좌표다.
const clickPlan = (container: HTMLElement, x: number, y: number) =>
  fireEvent.mouseDown(container.querySelector('.plansvg')!, { clientX: x, clientY: y })

// 실 수는 하단 리포트의 '배정 x/N', 실명은 도면 라벨(ZoneRect)에서 관찰한다(검출 결과 패널은 없앴다).
const statusText = (container: HTMLElement) => container.querySelector('.statusbar')!.textContent ?? ''
const planText = (container: HTMLElement) => container.querySelector('.plansvg')!.textContent ?? ''

describe('App — 실 자르기', () => {
  it('실을 자르면 실이 1곳 늘고 자식 두 실이 도면에 나타난다', () => {
    const { container } = render(<App />)
    expect(statusText(container)).toContain('/6')

    enterSlice()
    clickPlan(container, 149, 99) // 거실 한가운데를 세로선(90°)으로

    expect(statusText(container)).toContain('/7') // 6 → 7
    expect(planText(container)).toContain('거실-1')
    expect(planText(container)).toContain('거실-2')
    // (면적 보존은 도메인 테스트(sliceRoom)가 증명한다 — 여기서는 실이 나뉘는지만 본다)
  })

  it('절단선이 실을 가르지 않으면(빈 곳 클릭) 아무 일도 일어나지 않는다', () => {
    const { container } = render(<App />)
    enterSlice()
    clickPlan(container, 700, 440) // 실 밖

    expect(statusText(container)).toContain('/6')
  })

  it('너무 얇게 자르면 거부하고 왜 안 되는지 알린다', () => {
    const { container } = render(<App />)
    enterSlice()
    clickPlan(container, 26, 99) // 거실 좌변에서 2px — 조각이 부모의 1% 미만

    expect(screen.getByText(/너무 작습니다/)).toBeInTheDocument()
    expect(statusText(container)).toContain('/6') // 안 잘렸다
  })

  it('실내기 배치 단계가 아니면 V는 안내만 하고 모드로 들어가지 않는다', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' })) // → 실외기 선정·조합
    enterSlice()

    expect(screen.getByText(/실내기 배치 단계에서만/)).toBeInTheDocument()
  })

  // 도면이 진실이다 — 심볼 1개 = 실내기 1대 = 선정표 대수 1.
  it('실내기가 배치된 실을 자르면 심볼이 위치대로 나뉘고 유령 심볼이 남지 않는다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))

    // 침실1(AC_002, 292,24 ~ 472,134)에는 2대가 좌우로 놓인다(337,79)·(427,79).
    expect(container.querySelectorAll('[data-unit-id^="AC_002#"]')).toHaveLength(2)

    // 자르기는 배치 단계 그대로에서 한다(배치가 있으니 확인 팝업이 뜬다).
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
    enterSlice()
    clickPlan(container, 149, 99)

    expect(statusText(container)).toContain('실내기 배정 0/7')
  })

  // ── 적대적 QA 회귀 (2026-07-14) ──

  // [QA #3] 자른 자식 실을 선택한 채 실을 다시 시딩(시설군 변경)하면 domainRooms[primary]가
  // undefined가 되어 렌더 중 aiSelectionFor(undefined)가 터졌다 → 흰 화면.
  it('[QA] 자른 실을 선택한 채 시설군을 바꿔(재시딩) 실 id가 사라져도 죽지 않는다', () => {
    const { container } = render(<App />)
    enterSlice()
    clickPlan(container, 149, 99)

    // 자식 실을 선택한다(존 모드에서 클릭).
    fireEvent.keyDown(window, { key: 'z' })
    fireEvent.mouseDown(container.querySelector('polygon')!)

    // 시설군 변경 → 실이 새 id로 다시 시딩된다(배치가 없으니 확인 없이 바로 실행된다).
    fireEvent.change(screen.getByLabelText('시설군'), { target: { value: '주거시설' } })

    expect(statusText(container)).toContain('/6') // 살아 있다
  })

  // [QA #8] 자르기 모드가 단계를 넘어 유지돼, 실외기 선정 단계에서도 클릭이 실을 잘랐다.
  it('[QA] 다음 단계로 넘어가면 자르기 모드가 풀리고 클릭이 실을 자르지 않는다', () => {
    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    enterSlice()
    expect(container.querySelector('.slicehud')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' })) // place → combine
    expect(container.querySelector('.slicehud')).toBeNull() // 모드가 풀린다

    clickPlan(container, 149, 99)
    expect(statusText(container)).toContain('/6') // 여전히 6실(안 잘렸다)
  })

  it('부모 실을 선택한 채 잘라도 크래시하지 않는다(선택이 정리된다)', () => {
    const { container } = render(<App />)
    // 존 모드로 실을 클릭해 선택한다.
    fireEvent.keyDown(window, { key: 'z' })
    fireEvent.mouseDown(container.querySelector('polygon')!)

    enterSlice()
    clickPlan(container, 149, 99)

    expect(planText(container)).toContain('거실-1') // 잘렸고 크래시하지 않았다
    expect(statusText(container)).toContain('/7')
  })
})

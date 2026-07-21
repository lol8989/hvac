/** @vitest-environment jsdom */
// 조합 리포트 초기 상태 회귀 (NEXT #2·#3):
//  - 도면을 열면 실은 이미 검출돼 있으나(부하가 잡힌다), 배치·조합은 아직 비어 있어야 한다.
//  - 배정은 파이프라인 진행(배치→조합)의 결과로만 생겨야 한다(사전배정 시드 제거).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

const reportText = (container: HTMLElement) => container.querySelector('.statusbar')!.textContent ?? ''

describe('App — 조합 리포트 초기 상태 (NEXT #2·#3)', () => {
  it('초기 상태(실 검출 완료)에서 부하는 있으나 설치용량·실외기·배정·미배정은 0/빈이다', () => {
    const { container } = render(<App />)
    const t = reportText(container)
    expect(t).not.toContain('총 부하 0.0 kW') // 실이 이미 검출돼 부하가 있다
    expect(t).toContain('총 설치 용량 0.0 kW') // 실내기 미배치
    expect(t).toContain('실외기 0대')
    expect(t).toContain('실내기 배정 0/6')
    expect(t).toContain('미배정 0')
  })

  it('배치→조합 진행에 따라 미배정·배정이 파이프라인 결과로 채워진다', () => {
    const { container } = render(<App />)

    // 초기(검출 완료): 부하는 있으나 실내기 미설치라 미배정/배정은 아직 0.
    expect(reportText(container)).not.toContain('총 부하 0.0 kW')
    expect(reportText(container)).toContain('실내기 배정 0/6')
    expect(reportText(container)).toContain('미배정 0')

    // 배치: 실내기 설치 → 전 실이 미배정 풀로 편입(미배정 6).
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    expect(reportText(container)).toContain('미배정 6')
    expect(reportText(container)).toContain('실내기 배정 0/6')

    // 실외기 단계 진입 시 선정 알고리즘이 돈다 → 전 실 배정(미배정 0).
    // 정격 37.6kW EHP → 46.4kW 절환형 1대(조합비 0.81). 냉방전용 39.2kW는 난방 요구로 배제된다.
    // 실외기 대수·모델은 상수가 아니라 이 계산의 결과다.
    fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' }))
    expect(reportText(container)).toContain('실내기 배정 6/6')
    expect(reportText(container)).toContain('미배정 0')
    expect(reportText(container)).toContain('실외기 1대')
    expect(reportText(container)).toContain('평균 조합비 0.81')
    expect(reportText(container)).toContain('과부하 0')
  })

  // 실외기 '모델'이 부하에 따라 달라진다는 것은 어댑터 테스트가 증명한다
  // (planAdapter.test.ts — '실외기 대수·모델은 상수가 아니라 정격 총용량이 정한다').
  // 여기서는 시설군을 바꾸면 실이 그 단위부하로 다시 시딩돼 다른 부하·조합비로 수렴하는지만 본다.
  it('시설군을 바꾸면 부하가 달라지고 조합비도 그에 따라 다시 계산된다', () => {
    const run = (facility: string) => {
      const { container, unmount } = render(<App />)
      // 시설군 변경 = 그 시설군의 단위부하로 실 재시딩(배치 전이라 확인 없이 즉시 반영).
      fireEvent.change(screen.getByLabelText('시설군'), { target: { value: facility } })
      fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
      fireEvent.click(screen.getByRole('button', { name: '실외기 선정·조합' }))
      const t = reportText(container)
      unmount()
      const load = /총 부하 ([\d.]+) kW/.exec(t)![1]
      const ratio = /평균 조합비 ([\d.]+)/.exec(t)![1]
      return { load, ratio, t }
    }

    const office = run('OFFICE')
    const residential = run('주거시설')
    expect(office.load).not.toBe(residential.load) // 같은 도면, 다른 단위부하
    expect(office.ratio).not.toBe(residential.ratio) // 조합비는 그 부하의 결과
    for (const r of [office, residential]) expect(r.t).toContain('미배정 0')
  })
})

/** @vitest-environment jsdom */
// 조합 리포트 초기 상태 회귀 (NEXT #2·#3):
//  - 검출 전 초기 상태는 부하·배정·미배정이 모두 0/빈이어야 한다(사전배정 시드 제거).
//  - 배정은 파이프라인 진행(검출→배치→조합)의 결과로만 생겨야 한다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import App from './App'
import { FakeBroadcastChannel } from './test/fakeBroadcastChannel'

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

const reportText = (container: HTMLElement) => container.querySelector('.report')!.textContent ?? ''

describe('App — 조합 리포트 초기 상태 (NEXT #2·#3)', () => {
  it('검출 전 초기 상태에서 부하·설치용량·실외기·배정·미배정이 모두 0/빈이다', () => {
    const { container } = render(<App />)
    const t = reportText(container)
    expect(t).toContain('총 부하 0.0 kW')
    expect(t).toContain('총 설치 용량 0.0 kW')
    expect(t).toContain('실외기 0대')
    expect(t).toContain('실내기 배정 0/0')
    expect(t).toContain('미배정 0')
  })

  it('검출→배치→조합 진행에 따라 부하·미배정·배정이 파이프라인 결과로 채워진다', () => {
    const { container } = render(<App />)

    // 검출: 부하가 채워지되, 실내기 미설치라 미배정/배정은 아직 0.
    fireEvent.click(screen.getByRole('button', { name: '실 검출 실행 →' }))
    expect(reportText(container)).not.toContain('총 부하 0.0 kW')
    expect(reportText(container)).toContain('실내기 배정 0/6')
    expect(reportText(container)).toContain('미배정 0')

    // 배치: 실내기 설치 → 전 실이 미배정 풀로 편입(미배정 6).
    fireEvent.click(screen.getByRole('button', { name: '✦ AI 실내기 배치' }))
    expect(reportText(container)).toContain('미배정 6')
    expect(reportText(container)).toContain('실내기 배정 0/6')

    // 실외기 배치 진입 시 자동 조합 기본값 적용 → 전 실 배정(미배정 0), 실외기 2대.
    fireEvent.click(screen.getByRole('button', { name: '실외기 배치 →' }))
    fireEvent.click(screen.getByRole('button', { name: '실외기 조합 →' }))
    expect(reportText(container)).toContain('실내기 배정 6/6')
    expect(reportText(container)).toContain('미배정 0')
    expect(reportText(container)).toContain('실외기 2대')
  })
})

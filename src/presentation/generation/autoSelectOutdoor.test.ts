import { describe, it, expect } from 'vitest'
import { shouldAutoSelectOutdoor } from './autoSelectOutdoor'

// 실외기 조합 단계에 처음 들어오면 선정을 1회 자동 실행하되(그룹 0 + 배치 있음),
// 사용자가 방금 삭제해 그룹을 비운 경우엔 재선정하지 않는다(주인님 결정 2026-07-22, b안).
describe('shouldAutoSelectOutdoor', () => {
  const base = { step: 'combine' as const, groupCount: 0, placementCount: 6, suppressed: false }

  it('조합 단계 · 그룹 0 · 배치 있음 · 미억제면 자동 선정한다', () => {
    expect(shouldAutoSelectOutdoor(base)).toBe(true)
  })

  it('실외기 배치 단계에서도 (그룹 0 · 배치 있음) 자동 선정한다', () => {
    expect(shouldAutoSelectOutdoor({ ...base, step: 'outdoor' })).toBe(true)
  })

  it('실내기 배치 단계에서는 자동 선정하지 않는다', () => {
    expect(shouldAutoSelectOutdoor({ ...base, step: 'place' })).toBe(false)
  })

  it('산출물 단계에서는 자동 선정하지 않는다', () => {
    expect(shouldAutoSelectOutdoor({ ...base, step: 'output' })).toBe(false)
  })

  it('이미 그룹이 있으면 자동 선정하지 않는다(사용자 조정 보존)', () => {
    expect(shouldAutoSelectOutdoor({ ...base, groupCount: 1 })).toBe(false)
  })

  it('배치된 실내기가 없으면 자동 선정하지 않는다', () => {
    expect(shouldAutoSelectOutdoor({ ...base, placementCount: 0 })).toBe(false)
  })

  it('사용자가 방금 삭제해 억제된 상태면 그룹 0이어도 자동 선정하지 않는다', () => {
    expect(shouldAutoSelectOutdoor({ ...base, suppressed: true })).toBe(false)
  })
})

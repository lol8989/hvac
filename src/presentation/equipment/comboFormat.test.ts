// 조합비는 실무가 '103%'로 말하고 도메인은 1.03으로 계산한다. 그 변환을 고정한다.
import { describe, it, expect } from 'vitest'
import { toPercentLabel, toPercentInput, parsePercent } from './comboFormat'

describe('toPercentLabel', () => {
  it('비율을 퍼센트 라벨로 옮긴다', () => {
    expect(toPercentLabel(0.5)).toBe('50%')
    expect(toPercentLabel(1.03)).toBe('103%')
    expect(toPercentLabel(1.106)).toBe('110.6%')
  })
})

describe('parsePercent', () => {
  it('퍼센트 입력을 비율로 옮긴다', () => {
    expect(parsePercent('103')).toBe(1.03)
    expect(parsePercent('50')).toBe(0.5)
    expect(parsePercent(' 110.6 % ')).toBe(1.106)
  })

  it('부동소수 오차를 남기지 않는다', () => {
    expect(parsePercent('103')).toBe(1.03) // 103/100 = 1.0299999… 방지
  })

  it('빈 값·숫자가 아니면 null', () => {
    expect(parsePercent('')).toBeNull()
    expect(parsePercent('  ')).toBeNull()
    expect(parsePercent('abc')).toBeNull()
  })
})

describe('toPercentInput', () => {
  it('입력창 값은 % 기호 없이 숫자만', () => {
    expect(toPercentInput(1.03)).toBe('103')
    expect(toPercentInput(0.5)).toBe('50')
  })

  it('왕복해도 값이 보존된다', () => {
    for (const r of [0.5, 1.03, 1.106, 0.32]) {
      expect(parsePercent(toPercentInput(r))).toBe(r)
    }
  })
})

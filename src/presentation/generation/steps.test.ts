import { describe, it, expect } from 'vitest'
import { STEPS, stepIndex, nextStep, prevStep, isFirstStep, isLastStep } from './steps'

describe('generation steps', () => {
  it('5단계가 정의된 순서대로다 (업로드는 목록에서 완료 가정)', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['detect', 'place', 'adjust', 'combine', 'output'])
    expect(STEPS.map((s) => s.no)).toEqual([1, 2, 3, 4, 5])
  })

  it('미세조정(adjust)이 배치(place)와 조합(combine) 사이 독립 단계다', () => {
    expect(stepIndex('adjust')).toBe(stepIndex('place') + 1)
    expect(stepIndex('combine')).toBe(stepIndex('adjust') + 1)
  })

  it('nextStep/prevStep은 양 끝에서 클램프된다', () => {
    expect(nextStep('detect')).toBe('place')
    expect(nextStep('output')).toBe('output') // 마지막
    expect(prevStep('place')).toBe('detect')
    expect(prevStep('detect')).toBe('detect') // 처음
  })

  it('첫/마지막 단계 판별', () => {
    expect(isFirstStep('detect')).toBe(true)
    expect(isLastStep('output')).toBe(true)
    expect(isFirstStep('place')).toBe(false)
    expect(isLastStep('place')).toBe(false)
  })
})

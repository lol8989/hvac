import { describe, it, expect } from 'vitest'
import { STEPS, stepIndex, nextStep, prevStep, isFirstStep, isLastStep } from './steps'

describe('generation steps', () => {
  it('5단계가 정의된 순서대로다 (선정표 검토는 스텝이 아니라 새 창)', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['detect', 'place', 'outdoor', 'combine', 'output'])
    expect(STEPS.map((s) => s.no)).toEqual([1, 2, 3, 4, 5])
  })

  it('실외기 배치(outdoor)가 실내기 배치(place)와 조합(combine) 사이 독립 단계다', () => {
    expect(stepIndex('outdoor')).toBe(stepIndex('place') + 1)
    expect(stepIndex('combine')).toBe(stepIndex('outdoor') + 1)
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

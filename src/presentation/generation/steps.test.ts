import { describe, it, expect } from 'vitest'
import { STEPS, stepIndex, nextStep, prevStep, isFirstStep, isLastStep } from './steps'
import { STEP_ORDER } from '../../domain/generation/StepGuard'

describe('generation steps', () => {
  it('4단계가 정의된 순서대로다 (실 검출은 스텝이 아니라 초기 상태, 선정표 검토는 새 창)', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['place', 'combine', 'outdoor', 'output'])
    expect(STEPS.map((s) => s.no)).toEqual([1, 2, 3, 4])
  })

  it('표시 순서는 도메인의 파이프라인 순서(STEP_ORDER)와 같다', () => {
    expect(STEPS.map((s) => s.id)).toEqual([...STEP_ORDER])
  })

  it('실외기 선정·조합(combine)이 실외기 배치(outdoor)보다 앞선다', () => {
    // 몇 대가 필요한지 정해져야 어디 둘지 정한다. 부하 확정(place) → 선정(combine) → 배치(outdoor).
    expect(stepIndex('combine')).toBe(stepIndex('place') + 1)
    expect(stepIndex('outdoor')).toBe(stepIndex('combine') + 1)
  })

  it('nextStep/prevStep은 양 끝에서 클램프된다', () => {
    expect(nextStep('place')).toBe('combine')
    expect(nextStep('output')).toBe('output') // 마지막
    expect(prevStep('combine')).toBe('place')
    expect(prevStep('place')).toBe('place') // 처음
  })

  it('첫/마지막 단계 판별', () => {
    expect(isFirstStep('place')).toBe(true)
    expect(isLastStep('output')).toBe(true)
    expect(isFirstStep('combine')).toBe(false)
    expect(isLastStep('combine')).toBe(false)
  })
})

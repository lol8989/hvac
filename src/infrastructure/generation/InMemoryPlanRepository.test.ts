import { describe, it, expect } from 'vitest'
import { InMemoryPlanRepository } from './InMemoryPlanRepository'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'

describe('InMemoryPlanRepository (PlanRepository 포트 어댑터)', () => {
  it('save한 플랜을 load로 되돌려준다', () => {
    const repo = new InMemoryPlanRepository(new AssignmentPlan({ groups: [], pool: [] }))
    const p = new AssignmentPlan({ groups: [], pool: [] })
    repo.save(p)
    expect(repo.load()).toBe(p)
  })

  it('[적대] 저장 전 load는 초기 플랜을 반환한다', () => {
    const initial = new AssignmentPlan({ groups: [], pool: [] })
    const repo = new InMemoryPlanRepository(initial)
    expect(repo.load()).toBe(initial)
  })
})

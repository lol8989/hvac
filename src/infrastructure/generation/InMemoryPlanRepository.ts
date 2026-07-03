// PlanRepository 포트의 인메모리 어댑터 (POC/테스트용).
// 단일 배정 플랜을 메모리에 보관한다. 추후 서버/워커 연동 구현으로 교체 가능.

import type { PlanRepository } from '../../application/generation/ports'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'

export class InMemoryPlanRepository implements PlanRepository {
  private _plan: AssignmentPlan

  constructor(initialPlan: AssignmentPlan) {
    this._plan = initialPlan
  }

  load(): AssignmentPlan {
    return this._plan
  }

  save(plan: AssignmentPlan): void {
    this._plan = plan
  }
}

// PlanRepository 포트의 인메모리 어댑터 (POC/테스트용).
// 단일 배정 플랜을 메모리에 보관한다. 추후 서버/워커 연동 구현으로 교체 가능.

import { PlanRepository } from '../../application/generation/ports.js'

export class InMemoryPlanRepository extends PlanRepository {
  constructor(initialPlan) {
    super()
    this._plan = initialPlan
  }

  load() {
    return this._plan
  }

  save(plan) {
    this._plan = plan
  }
}

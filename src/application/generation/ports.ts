// 애플리케이션 포트(인터페이스). 유즈케이스는 이 포트에만 의존하고 구현(infrastructure)은 주입받는다.
//
// 구현 예: infrastructure/generation/InMemoryPlanRepository (POC),
//          추후 서버/워커 연동 리포지토리로 교체.

import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'

export interface PlanRepository {
  load(): AssignmentPlan
  save(plan: AssignmentPlan): void
}

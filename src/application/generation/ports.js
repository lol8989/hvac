// 애플리케이션 포트(인터페이스). 유즈케이스는 이 포트에만 의존하고 구현(infrastructure)은 주입받는다.
// JS에는 인터페이스가 없으므로 계약을 문서화하고, 구현하지 않은 사용을 조기에 드러내는 베이스를 제공한다.
//
// PlanRepository 계약:
//   load(): AssignmentPlan            — 현재 배정 플랜을 반환
//   save(plan: AssignmentPlan): void  — 배정 플랜을 저장(교체)
//
// 구현 예: infrastructure/generation/InMemoryPlanRepository (POC),
//          추후 서버/워커 연동 리포지토리로 교체.

export class PlanRepository {
  load() {
    throw new Error('PlanRepository.load()는 구현되어야 합니다')
  }

  // eslint-disable-next-line no-unused-vars
  save(plan) {
    throw new Error('PlanRepository.save(plan)는 구현되어야 합니다')
  }
}

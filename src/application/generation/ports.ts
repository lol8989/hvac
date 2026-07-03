// 애플리케이션 포트(인터페이스). 유즈케이스는 이 포트에만 의존하고 구현(infrastructure)은 주입받는다.
//
// 구현 예: infrastructure/generation/InMemoryPlanRepository (POC),
//          추후 서버/워커 연동 리포지토리로 교체.

import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { EnergySourceCode } from '../../domain/shared/EnergySource'

export interface PlanRepository {
  load(): AssignmentPlan
  save(plan: AssignmentPlan): void
}

// 장비마스터(Equipment Master)가 게시하는 실외기 모델 스펙 계약.
// 생성(Generation) 컨텍스트는 마스터의 PUBLISHED 스펙만 소비한다(Customer/Supplier).
export interface OutdoorModelSpec {
  model: string
  category: string
  energySource: EnergySourceCode
  capacityKw: number
  maxConnections: number // 모델별 최대 연결 실내기 수
}

// 실외기 스펙 카탈로그 포트(읽기 전용). 구현: infrastructure의 카탈로그 어댑터
// (POC는 인메모리, 추후 장비마스터 API 클라이언트로 교체).
export interface OutdoorModelCatalog {
  list(): OutdoorModelSpec[]
  findByModel(model: string): OutdoorModelSpec | undefined
}

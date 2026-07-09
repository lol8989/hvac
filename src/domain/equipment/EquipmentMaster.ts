// 장비마스터 게시 조회 포트 (Equipment Master의 published 언어).
// 생성(Generation)·검도(Review)는 이 포트를 통해 PUBLISHED 스펙만 참조한다(역방향 의존 금지).
// 구현: infrastructure/equipment/InMemoryEquipmentMaster (POC), 추후 마스터 API 클라이언트로 교체.

import type { IndoorSpecFields, OutdoorSpecFields } from './MasterRecord'

export interface EquipmentMaster {
  // 게시(PUBLISHED)된 실내기 모델 스펙만 반환한다(DRAFT/ARCHIVED 제외).
  publishedIndoor(): readonly IndoorSpecFields[]
  // 게시(PUBLISHED)된 실외기 모델 스펙만 반환한다(DRAFT/ARCHIVED 제외).
  publishedOutdoor(): readonly OutdoorSpecFields[]
}

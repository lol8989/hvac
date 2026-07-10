// 롱테일 스펙(product_specs) 조회 포트.
//
// EquipmentMaster(publishedIndoor/Outdoor)에 얹지 않는다 — 그 포트는 생성·검도가 값객체를 만드는
// hot 필드 계약이고, 인메모리 마스터와 동치를 유지해야 한다. 일람표용 롱테일 스펙은 별도 관심사다.
//
// SQLite가 없을 때(인메모리 폴백)는 EMPTY_SPEC_REPOSITORY를 주입한다 → 일람표 셀이 '-'로 남는다.

import type { SpecData } from '../../domain/equipment/SpecLookup'

export interface EquipmentSpecRepository {
  // 모델명 → 롱테일 스펙. 없는 모델은 결과 맵에서 빠진다(빈 객체를 만들지 않는다).
  specsOf(modelCodes: readonly string[]): Map<string, SpecData>
}

export const EMPTY_SPEC_REPOSITORY: EquipmentSpecRepository = {
  specsOf: () => new Map(),
}

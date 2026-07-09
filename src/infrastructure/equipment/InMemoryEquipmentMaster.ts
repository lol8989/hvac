// 장비마스터(Equipment Master) 인메모리 어댑터 (POC).
// 실내기·실외기 모델 스펙의 단일 진실 공급원(SSOT). 게시 상태(status)를 함께 보유하고,
// publishedXxx()는 PUBLISHED만 노출한다(게시 게이트). 추후 마스터 DB/API 구현으로 교체.
//
// 근거: 표준 260415 장비선정표 엑셀 — 실내기 Multi V Super 탭(20C/40C/110T 실측, 나머지 난방 ×1.10~1.13 보간),
//       실외기 스펙(냉난방/HP/최대연결수). ⚠️ 단가·등급·COP는 POC 플레이스홀더(미확정, 실데이터 교체 예정).

import type { EquipmentMaster } from '../../domain/equipment/EquipmentMaster'
import type { IndoorMasterRecord, IndoorSpecFields, OutdoorMasterRecord, OutdoorSpecFields } from '../../domain/equipment/MasterRecord'
import { isPublished } from '../../domain/equipment/PublishStatus'
import { INDOOR_RECORDS, OUTDOOR_RECORDS } from './seedData'

// status를 벗겨 스펙 필드만 노출(게시 게이트 통과분).
const stripIndoor = ({ status: _s, ...spec }: IndoorMasterRecord): IndoorSpecFields => spec
const stripOutdoor = ({ status: _s, ...spec }: OutdoorMasterRecord): OutdoorSpecFields => spec

export class InMemoryEquipmentMaster implements EquipmentMaster {
  private readonly _indoor: readonly IndoorSpecFields[] = Object.freeze(INDOOR_RECORDS.filter((r) => isPublished(r.status)).map(stripIndoor))
  private readonly _outdoor: readonly OutdoorSpecFields[] = Object.freeze(OUTDOOR_RECORDS.filter((r) => isPublished(r.status)).map(stripOutdoor))

  publishedIndoor(): readonly IndoorSpecFields[] {
    return this._indoor
  }

  publishedOutdoor(): readonly OutdoorSpecFields[] {
    return this._outdoor
  }
}

// 기본 싱글턴 — 카탈로그 어댑터가 별도 주입이 없을 때 참조하는 "그" 게시 마스터.
export const defaultEquipmentMaster: EquipmentMaster = new InMemoryEquipmentMaster()

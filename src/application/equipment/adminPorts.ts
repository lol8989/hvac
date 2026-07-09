// 장비마스터 관리(admin) 포트. 게시 상태와 무관하게 전 제품을 조회/편집한다(관리자 전용).
// 생성/검도의 읽기 포트(EquipmentMaster=PUBLISHED만)와 구분된다.
// 구현: infrastructure/equipment/sqlite/SqliteEquipmentAdminRepository (POC), 추후 마스터 API로 교체.

import type { PublishStatus } from '../../domain/equipment/PublishStatus'

// 관리 목록의 한 행(4단 분류 평탄화 + 현행가 + 게시 상태).
export interface ProductRow {
  id: number
  categoryCode: string // INDOOR / OUTDOOR
  categoryName: string // 실내기 / 실외기
  subcategoryName: string // 4WAY 카세트 / 냉난방 절환형 / GHP ...
  energySource: string | null // EHP / GHP ...
  seriesName: string
  modelCode: string
  equipmentCode: string | null
  horsepower: number | null
  coolingW: number | null
  heatingW: number | null
  status: PublishStatus
  priceKrw: number | null // 현행 소비자가(없으면 null)
}

export interface EquipmentAdminRepository {
  // 전 상태(DRAFT/PUBLISHED/ARCHIVED) 제품 목록. 분류 정렬 순.
  listProducts(): ProductRow[]
}

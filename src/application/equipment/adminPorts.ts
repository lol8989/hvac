// 장비마스터 관리(admin) 포트. 게시 상태와 무관하게 전 제품을 조회/편집한다(관리자 전용).
// 생성/검도의 읽기 포트(EquipmentMaster=PUBLISHED만)와 구분된다.
// 구현: infrastructure/equipment/sqlite/SqliteEquipmentAdminRepository (POC), 추후 마스터 API로 교체.

import type { PublishStatus } from '../../domain/equipment/PublishStatus'
import type { ProductDraft, ProductPatch } from '../../domain/equipment/ProductDraft'

// 관리 목록의 한 행(4단 분류 평탄화 + 현행가 + 게시 상태).
export interface ProductRow {
  id: number
  categoryCode: string // INDOOR / OUTDOOR
  categoryName: string // 실내기 / 실외기
  subcategoryName: string // 4WAY 카세트 / 냉난방 절환형 / GHP ...
  energySource: string | null // EHP / GHP ...
  seriesCode: string // 등록·수정 폼의 시리즈 선택값과 대응
  seriesName: string
  modelCode: string
  equipmentCode: string | null
  horsepower: number | null
  coolingW: number | null
  heatingW: number | null
  maxConnections: number | null
  status: PublishStatus
}

// 등록·수정 폼의 시리즈 선택지(4단 분류 평탄화).
export interface SeriesOption {
  code: string
  nameKo: string
  categoryCode: string
  categoryName: string
  subcategoryName: string
  energySource: string | null
}

export interface EquipmentAdminRepository {
  // 전 상태(DRAFT/PUBLISHED/ARCHIVED) 제품 목록. 분류 정렬 순.
  listProducts(): ProductRow[]

  // 등록 폼용 시리즈 선택지.
  listSeries(): SeriesOption[]

  // 신규 제품 등록 → 항상 DRAFT로 생성. 새 제품 id 반환.
  // throws DUPLICATE_MODEL_CODE / INVALID_FIELD / NOT_FOUND(시리즈)
  createProduct(draft: ProductDraft): number

  // 스펙 수정 — DRAFT만 허용(게시본 잠금). throws SPEC_LOCKED / NOT_FOUND / INVALID_FIELD / DUPLICATE_MODEL_CODE
  updateProduct(id: number, patch: ProductPatch): void

  // 게시 상태 전이 — 허용 전이만(선형 + 재게시). throws INVALID_TRANSITION / NOT_FOUND
  setStatus(id: number, next: PublishStatus): void
}

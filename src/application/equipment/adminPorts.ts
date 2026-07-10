// 장비마스터 관리(admin) 포트. 게시 상태와 무관하게 전 제품을 조회/편집한다(관리자 전용).
// 생성/검도의 읽기 포트(EquipmentMaster=PUBLISHED만)와 구분된다.
// 구현: infrastructure/equipment/sqlite/SqliteEquipmentAdminRepository (POC), 추후 마스터 API로 교체.

import type { ComboPolicy } from '../../domain/equipment/ComboPolicy'
import type { ComboRange } from '../../domain/shared/ComboRange'
import type { HpSource } from '../../domain/equipment/HpSource'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'
import type { ProductDraft, ProductPatch } from '../../domain/equipment/ProductDraft'
import type { ImportRow } from '../../domain/equipment/SpecImport'

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
  hpSource: HpSource | null // DERIVED = 냉방용량 환산 추정치(실측 아님)
  coolingW: number | null
  heatingW: number | null
  maxConnections: number | null
  status: PublishStatus
  createdAt: string | null // 등록일 (ISO)
  updatedAt: string | null // 수정일 (ISO)
  publishedAt: string | null // 게시일 (ISO) — 미게시는 null
}

// 등록·수정 폼의 시리즈 선택지(4단 분류 평탄화).
export interface SeriesOption {
  code: string
  nameKo: string
  categoryCode: string
  categoryName: string
  subcategoryName: string
  energySource: string | null
  isVrf: boolean // VRF 계열 — 업로드 시 모델명 HP 유도, 아니면 냉방용량 환산 백필
}

// 일괄 전이 결과 — 적용 건수 + 건너뛴 행의 사유(미리보기/토스트 표시용).
export interface BulkStatusResult {
  applied: number
  skipped: ReadonlyArray<{ id: number; modelCode: string; reason: string }>
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

  // 일괄 상태 전이. 전이 불가·게시 전제조건 미달 행은 사유와 함께 건너뛰고 나머지만 적용한다
  // (한 건 때문에 수백 건이 실패하지 않도록). 적용분은 단일 트랜잭션.
  setStatusMany(ids: readonly number[], next: PublishStatus): BulkStatusResult

  // ── 조합비 정책 ──
  // 전역 기본 + 실외기 모델별 override. 게시 상태와 무관하다(스펙이 아니라 정책이므로 게시본도 조정 가능).
  getComboPolicy(): ComboPolicy

  // 전역 기본 저장. throws INVALID_FIELD(min>=max 등 ComboRange 불변식 위반)
  saveGlobalComboRange(range: ComboRange): void

  // 모델별 override 저장. range가 null이면 override를 걷어내 전역 기본으로 되돌린다.
  // throws NOT_FOUND(모델), INVALID_FIELD
  setProductComboRange(modelCode: string, range: ComboRange | null): void

  // 스펙시트 업로드 일괄 등록. verdict==='OK' 행만 DRAFT로 적재하고 롱테일 스펙을 product_specs에 저장한다.
  // 오류·중복 행은 조용히 건너뛴다(사유는 미리보기에서 이미 제시됨). 반환값: 실제 적재 건수.
  // 전부 한 트랜잭션 — 하나라도 실패하면 아무것도 남지 않는다. throws NOT_FOUND(시리즈)
  importProducts(seriesCode: string, rows: readonly ImportRow[]): number
}

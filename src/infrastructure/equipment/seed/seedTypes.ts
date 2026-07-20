// 장비마스터 시드 데이터 계약 (빌드 산출물 public/equipment-seed.json ↔ SQLite 시딩).
// 생성기: scripts/buildSpecSeed.ts (LG 스펙시트 50개 → 4단 분류 + 제품 + 롱테일 스펙)

import type { HpSource } from '../../../domain/equipment/HpSource'
import type { PublishStatus } from '../../../domain/equipment/PublishStatus'
import type { SpecCell } from '../../../domain/equipment/SpecImport'

export interface SeedCategory {
  code: string // INDOOR / OUTDOOR / VENT
  nameKo: string
  sortOrder: number
}

export interface SeedSubcategory {
  code: string
  categoryCode: string
  nameKo: string
}

export interface SeedSeries {
  code: string
  subcategoryCode: string
  nameKo: string
  mflCode: string | null
  isVrf: boolean // VRF 계열 — 모델명 HP 인코딩 · maxConn 게시 요건 · 생성단 조합 후보 노출
  // 계열(EHP / GHP / AWHP / 수냉식 / Chiller / CDU / ERV)은 시리즈 속성이다.
  // 중분류에 두면 '기타 실내기(IN_ETC)'처럼 계열이 섞인 버킷이 첫 적재 파일의 계열로 오염된다.
  energySource: string
}

export interface SeedProduct {
  seriesCode: string
  modelCode: string
  horsepower: number | null // VRF=모델명 유도 · 비-VRF=냉방용량 환산 백필 · 큐레이션=시드값
  hpSource: HpSource | null // 마력 출처(추정치 구분). HP가 없으면 null
  coolingW: number | null
  heatingW: number | null
  maxConnections: number | null
  efficiencyGradeId: number | null // 에너지소비효율등급(1~5). 스펙시트 모델은 미추출(null)
  copCooling: number | null
  copHeating: number | null
  status: PublishStatus
  specData: Record<string, SpecCell> // 롱테일 스펙(전원·배관경·전선·차단기·냉매 …)
  source: string | null // 원본 파일명 · 시트명
}

export interface SeedPrice {
  modelCode: string
  priceKrw: number
  priceWithVatKrw: number | null
  effectiveStartDate: string
  priority: number
}

// 단품(SINGLE) 세트 — 실외기 1 + 실내기 1 조합 상품.
// 제품(마스터 레코드)이 아니라 '조합'이다. 능력은 세트 단위로만 정의된다(실외기 시트 단독엔 없다).
// 아직 SQLite에 적재하지 않는다 — 설계된 product_combinations / indoor_outdoor_compat 테이블의
// 입력이 될 데이터이며(구현계획서 Phase 3+), 지금은 잃어버리지 않도록 시드에 보존만 한다.
export interface SeedCombination {
  setCode: string // 원문 'TUW072PA2SR + TNW072PA2UR'
  models: string[] // 구성 모델
  coolingW: number | null
  heatingW: number | null
  source: string | null
}

export interface SeedData {
  hash: string // 내용 해시 — IndexedDB 캐시 무효화 키
  generatedFrom: string // 원본 디렉터리 설명
  categories: SeedCategory[]
  subcategories: SeedSubcategory[]
  series: SeedSeries[]
  products: SeedProduct[]
  prices: SeedPrice[]
  combinations: SeedCombination[] // 단품 세트(제품 아님) — 보존용
}

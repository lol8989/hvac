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
  energySource: string // EHP / GHP / AWHP / 수냉식 / Chiller / CDU / ERV
}

export interface SeedSeries {
  code: string
  subcategoryCode: string
  nameKo: string
  mflCode: string | null
  isVrf: boolean // VRF 계열 — 모델명 HP 인코딩 · maxConn 게시 요건 · 생성단 조합 후보 노출
}

export interface SeedProduct {
  seriesCode: string
  modelCode: string
  equipmentCode: string | null // 장비번호(40C 등). 스펙시트에 없어 큐레이션된 게시본만 보유
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

export interface SeedData {
  hash: string // 내용 해시 — IndexedDB 캐시 무효화 키
  generatedFrom: string // 원본 디렉터리 설명
  categories: SeedCategory[]
  subcategories: SeedSubcategory[]
  series: SeedSeries[]
  products: SeedProduct[]
  prices: SeedPrice[]
}

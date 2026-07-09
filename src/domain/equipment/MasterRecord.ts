// 장비마스터(Equipment Master) 레코드 타입 — 마스터가 소유하는 장비 스펙 SSOT.
// 게시 상태(status)를 함께 보유하며, 검도·생성은 PUBLISHED만 참조한다(Customer/Supplier).
// 순수 데이터 타입(프레임워크 무지). 스펙 필드(*SpecFields)는 status 없는 원본 스펙이고,
// *MasterRecord = 스펙 필드 + status.

import type { EnergySourceCode } from '../shared/EnergySource'
import type { PublishStatus } from './PublishStatus'

// ── 실내기 ──
export interface IndoorSpecFields {
  code: string // 장비번호 코드 (예: '40C', '110T')
  model: string // 모델명 (예: 'RNW0401C2S')
  coolW: number // 냉방용량(W)
  heatW: number // 난방용량(W)
  type: string // 실내기 유형 (예: '4WAY 카세트', '덕트')
  energySource: EnergySourceCode
}

export interface IndoorMasterRecord extends IndoorSpecFields {
  status: PublishStatus
}

// ── 실외기 ──
// 필드명은 장비선정표 엑셀 레거시(cat/sys/cool)를 유지한다(시드 재사용). 표준 스펙 계약(OutdoorModelSpec)
// 으로의 변환은 생성 컨텍스트의 카탈로그 어댑터(toOutdoorModelSpec)가 담당한다.
export interface OutdoorSpecFields {
  model: string
  cat: string
  sys: EnergySourceCode
  cool: number // 냉방용량(kW)
  heatKw: number | null // 난방용량(kW). 냉방전용은 null
  hp: number // 마력(HP) — 장비번호
  maxConn: number // 최대 연결 실내기 수
  comboMin?: number // 제품군별 조합비 하한(미지정 시 기본 0.5)
  comboMax?: number // 제품군별 조합비 상한(미지정 시 기본 1.3)
  // 단가는 선택 항목이다 — 스펙시트에 단가가 없어 실데이터 모델 대부분은 현행가가 없다.
  priceKrw?: number // VAT별도 소비자가(정수 원)
  priceTypeCode?: string
  priceWithVatKrw?: number | null // 미상은 null
  effectiveStartDate?: string // yyyy-mm-dd
  priority?: number
  efficiencyGradeId: number | null // 에너지소비효율등급(1~5). 미부여 시 null
  copCooling: number | null // 냉방 효율비
  copHeating: number | null // 난방 효율비
}

export interface OutdoorMasterRecord extends OutdoorSpecFields {
  status: PublishStatus
}

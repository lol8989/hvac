// 장비선정표(SelectionTable) 계약 타입 (Generation 컨텍스트).
// 빌더 구현은 SelectionTable.ts — 공개 API는 SelectionTable.ts에서 재수출된다.

import type { ComboRange } from '../shared/ComboRange'
import type { Room } from './Room'
import type { Placement } from './Placement'
import type { IndoorModel } from './IndoorModel'

export interface SelectionGroupInput {
  key: string
  label: string
  model: string // 실외기 모델명 (outdoorSpecs 참조 키)
  items: readonly string[] // 그룹에 배정된 roomId 목록
}

export interface OutdoorSpecLite {
  model: string
  coolKw: number
  heatKw: number | null
  hp: number
  comboRange?: ComboRange // 미지정 시 ComboRange.DEFAULT
}

export interface SelectionTableInput {
  rooms: readonly Room[] // 입력 순서 유지
  placements: Readonly<Record<string, Placement>> // 없는 실은 실내기 미지정 행
  groups: readonly SelectionGroupInput[]
  indoorModels: readonly IndoorModel[]
  outdoorSpecs: readonly OutdoorSpecLite[]
}

export type ComboJudgement = 'UNDERLOADED' | 'OK' | 'OVERLOADED'

export interface SelectionRow {
  roomId: string
  floor: string
  roomName: string
  areaM2: number
  unitLoad: {
    coolKcal: number
    heatKcal: number
    coolW: number
    heatW: number
    overridden: boolean
    // 사용자가 이 실의 단위부하를 직접 고쳤을 때 '적정 수치'인지 판정하는 근거 범위(kcal/h·㎡).
    // 그 실명·시설군에 단위부하표가 정의한 강도 칸의 최소~최대. 표에 없는 실은 null(판정 안 함).
    reasonableCoolKcal: { min: number; max: number } | null
  }
  requiredW: { cool: number; heat: number }
  indoor: null | {
    code: string
    model: string
    type: string
    coolW: number
    heatW: number
    quantity: number
    totalCoolW: number
    totalHeatW: number
    overridden: boolean
  }
  group: null | { key: string; label: string }
  // 그룹 소속 실 중 표 순서상 첫 행에만 부착, 그 외 null
  outdoor: null | {
    hp: number
    model: string
    coolKw: number
    heatKw: number | null
    quantity: number
    comboRatio: number
    judgement: ComboJudgement
  }
}

export interface SelectionSubtotal {
  quantity: number
  totalCoolW: number
  totalHeatW: number
}

// 실외기 그룹 소섹션. 조합비는 행이 아니라 그룹에 붙는다.
//
// 근거: Confluence「자동배치 룰」 ⑥-(3) "실내기를 층별로 먼저 묶고, 층 안에서만 실외기를 구성한다.
// 한 실외기가 여러 층에 걸치지 않는다." → 그룹은 항상 한 층 안에 있다.
export interface GroupSection {
  key: string
  label: string
  rows: readonly SelectionRow[]
  subtotal: SelectionSubtotal
  outdoor: {
    hp: number
    model: string
    coolKw: number
    heatKw: number | null
    quantity: number
    comboRatio: number
    judgement: ComboJudgement
  }
}

export interface FloorSection {
  floor: string
  // 표 순서 그대로의 평탄한 행 목록(CSV 직렬화·집계용). groups/unassigned와 같은 행을 가리킨다.
  rows: readonly SelectionRow[]
  groups: readonly GroupSection[]
  unassigned: readonly SelectionRow[] // 아직 실외기에 배정되지 않은 실
  subtotal: SelectionSubtotal // 배치된 실내기만(미배정 포함)
}

export interface SelectionBom {
  indoor: readonly { code: string; model: string; quantity: number }[]
  outdoor: readonly { hp: number; model: string; quantity: number }[]
  indoorTotal: number
  outdoorTotal: number
  hpTotal: number // Σ(hp × 그룹수)
}

export interface SelectionTable {
  floors: readonly FloorSection[]
  bom: SelectionBom
}

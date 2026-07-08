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
  unitLoad: { coolKcal: number; heatKcal: number; coolW: number; heatW: number; overridden: boolean }
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

export interface FloorSection {
  floor: string
  rows: readonly SelectionRow[]
  subtotal: { quantity: number; totalCoolW: number; totalHeatW: number } // 배치된 실내기만
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

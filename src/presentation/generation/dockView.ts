// 조합 매핑 도크 뷰모델: 장비선정표(SelectionTable) → 층 → 실외기 → 실 계층.
//
// 도크가 보여줄 데이터는 이미 도메인(SelectionTable)이 "잘 디버깅한 결과"로 갖고 있다:
//  - 층(FloorSection) → 실외기(GroupSection: 모델·HP·용량·조합비·판정) → 실(SelectionRow)
//  - 실별 컬럼: 면적(areaM2) · 단위부하 칼로리(unitLoad.coolKcal) · 부하(requiredW.cool)
//    · 실내기 모델(indoor.model) · 대수(indoor.quantity)
// 여기서는 그 표를 도크가 렌더할 최소 형태로 옮기기만 한다(계산은 도메인이 이미 했다).

import type { SelectionTable, SelectionRow, ComboJudgement } from '../../domain/generation/SelectionTable.types'

export interface DockRoomRow {
  roomId: string
  name: string
  areaM2: number
  coolKcal: number // 단위부하(kcal/h·㎡)
  loadKw: number // 냉방 필요부하(kW). 도크에서 직접 수정 가능(내부적으로 단위부하로 환산 저장).
  model: string | null // 실내기 모델명(미지정 시 null)
  qty: number // 실내기 대수(도면 심볼 수)
}

export interface DockGroupView {
  key: string
  label: string
  model: string // 실외기 모델
  hp: number
  coolKw: number
  ratio: number // 조합비
  judgement: ComboJudgement
  unitCount: number // 연결 실내기 대수(Σ qty)
  roomCount: number
  rooms: DockRoomRow[]
}

export interface DockFloorView {
  floor: string
  groups: DockGroupView[]
  unassigned: DockRoomRow[] // 아직 실외기에 배정되지 않은 실
}

const rowOf = (r: SelectionRow): DockRoomRow => ({
  roomId: r.roomId,
  name: r.roomName,
  areaM2: r.areaM2,
  coolKcal: r.unitLoad.coolKcal,
  loadKw: r.requiredW.cool / 1000,
  model: r.indoor?.model ?? null,
  qty: r.indoor?.quantity ?? 0,
})

export const buildDockView = (table: SelectionTable): DockFloorView[] =>
  table.floors.map((f) => ({
    floor: f.floor,
    groups: f.groups.map((g) => {
      const rooms = g.rows.map(rowOf)
      return {
        key: g.key,
        label: g.label,
        model: g.outdoor.model,
        hp: g.outdoor.hp,
        coolKw: g.outdoor.coolKw,
        ratio: g.outdoor.comboRatio,
        judgement: g.outdoor.judgement,
        unitCount: rooms.reduce((a, r) => a + r.qty, 0),
        roomCount: rooms.length,
        rooms,
      }
    }),
    unassigned: f.unassigned.map(rowOf),
  }))

// 전체 미배정 실(층 구분 없이) — 선정 대기/미배정 바구니 렌더용.
export const allUnassigned = (floors: readonly DockFloorView[]): DockRoomRow[] =>
  floors.flatMap((f) => f.unassigned)

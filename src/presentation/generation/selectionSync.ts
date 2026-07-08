// 장비선정표 '새 창' ↔ 메인 창(생성 작업) 동기화 프로토콜 (BroadcastChannel).
// 도면을 가리지 않기 위해 선정표는 별도 창에서 열리며, 편집은 메인 창 상태(SSOT)에
// 커맨드로 반영되고 메인 창이 갱신된 스냅샷을 재방송한다(단방향 데이터 흐름).

import type { SelectionTable } from '../../domain/generation/SelectionTable'

export const SELECTION_CHANNEL = 'poc-selection'

// 새 창 → 메인: 접속 알림(현재 스냅샷 요청)
export interface SelectionHelloMsg {
  type: 'hello'
}

// 메인 → 새 창: 선정표 스냅샷(상태 변경 시마다 재방송)
export interface SelectionSnapshotMsg {
  type: 'table'
  table: SelectionTable
  groupOptions: ReadonlyArray<{ key: string; label: string }>
  indoorModelOptions: ReadonlyArray<{ code: string }>
}

// 새 창 → 메인: 셀 편집 커맨드(메인 창의 동일 핸들러로 적용)
export type SelectionEditMsg =
  | { type: 'edit'; op: 'rename'; roomId: string; name: string }
  | { type: 'edit'; op: 'unitLoad'; roomId: string; coolKcal: number; heatKcal: number }
  | { type: 'edit'; op: 'resetUnitLoad'; roomId: string }
  | { type: 'edit'; op: 'indoor'; roomId: string; modelCode: string; quantity: number }
  | { type: 'edit'; op: 'resetIndoor'; roomId: string }
  | { type: 'edit'; op: 'move'; roomId: string; to: string }

export type SelectionMsg = SelectionHelloMsg | SelectionSnapshotMsg | SelectionEditMsg

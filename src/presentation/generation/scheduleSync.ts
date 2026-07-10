// 장비일람표 '새 창' ↔ 메인 창 동기화 (BroadcastChannel).
//
// 선정표(selectionSync)와 같은 패턴이지만 일람표는 읽기 전용이라 편집 커맨드가 없다.
// 새 창은 hello를 보내고, 메인 창이 시트 스냅샷을 방송한다(단방향).

import type { ScheduleSheet } from './scheduleTable'

export const SCHEDULE_CHANNEL = 'poc-schedule'

export interface ScheduleHelloMsg {
  type: 'hello'
}

export interface ScheduleSnapshotMsg {
  type: 'sheets'
  sheets: ScheduleSheet[]
}

export type ScheduleMsg = ScheduleHelloMsg | ScheduleSnapshotMsg

// 장비일람표 '새 창' 동기화 (presentation 훅).
//
// 일람표는 컬럼이 24~31개라 도면 화면 안에 넣을 수 없다 → 별도 창.
// 선정표와 달리 **읽기 전용**이다(편집 커맨드가 없다).
//
// 이 훅이 바뀌는 이유는 하나: 창 간 통신 방식.

import { useEffect, useRef } from 'react'
import { SCHEDULE_CHANNEL } from './scheduleSync'
import type { ScheduleMsg } from './scheduleSync'
import type { ScheduleSheet } from './scheduleTable'

export function useScheduleSync(sheets: ScheduleSheet[]): void {
  // hello 응답이 최신 시트를 보도록 ref로 들고 있는다(채널은 한 번만 연다).
  const sheetsRef = useRef(sheets)
  const bcRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(SCHEDULE_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e: MessageEvent<ScheduleMsg>) => {
      if (e.data?.type === 'hello') bc.postMessage({ type: 'sheets', sheets: sheetsRef.current } satisfies ScheduleMsg)
    }
    return () => { bc.close(); bcRef.current = null }
  }, [])

  useEffect(() => {
    sheetsRef.current = sheets
    bcRef.current?.postMessage({ type: 'sheets', sheets } satisfies ScheduleMsg)
  }, [sheets])
}

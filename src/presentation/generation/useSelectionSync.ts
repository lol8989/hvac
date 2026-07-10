// 장비선정표 '새 창' 동기화 (presentation 훅).
//
// 선정표는 파이프라인 스텝이 아니라 별도 창이다 — 도면을 가리지 않고 확인·조정한다
// (doc/05_설계결정/장비선정표_구현_설계_v1.md §4, 결정 #2).
//
// 데이터 흐름은 단방향이다: 메인 창이 SSOT, 새 창은 스냅샷을 받아 그리고 편집을 커맨드로 올린다.
// 최신 스냅샷·핸들러를 ref로 유지해 채널 콜백의 stale closure를 막는다.
//
// 이 훅이 바뀌는 이유는 하나: 창 간 통신 방식(BroadcastChannel → postMessage/서버 등).

import { useEffect, useRef } from 'react'
import { SELECTION_CHANNEL } from './selectionSync'
import type { SelectionMsg, SelectionSnapshotMsg } from './selectionSync'

// 새 창이 올리는 편집 커맨드를 메인 상태에 적용하는 핸들러 묶음.
export interface SelectionEditHandlers {
  renameRoom: (roomId: string, name: string) => void
  overrideUnitLoad: (roomId: string, coolKcal: number, heatKcal: number) => void
  resetUnitLoad: (roomId: string) => void
  overrideIndoor: (roomId: string, modelCode: string, quantity: number) => void
  resetIndoor: (roomId: string) => void
  moveRoomFromGrid: (roomId: string, to: string) => void
}

/**
 * snapshot이 바뀔 때마다 새 창에 재방송하고, 새 창의 hello/edit 메시지를 처리한다.
 * deps는 재방송 트리거(상태 객체들) — snapshot 자체는 매 렌더 새로 만들어지므로 쓰지 않는다.
 */
export function useSelectionSync(snapshot: SelectionSnapshotMsg, handlers: SelectionEditHandlers, deps: unknown[]): void {
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot
  const editRef = useRef(handlers)
  editRef.current = handlers
  const bcRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(SELECTION_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e: MessageEvent<SelectionMsg>) => {
      const m = e.data
      if (m?.type === 'hello') { bc.postMessage(snapshotRef.current); return } // 새 창 접속 → 현재 스냅샷 응답
      if (m?.type !== 'edit') return
      const h = editRef.current
      if (m.op === 'rename') h.renameRoom(m.roomId, m.name)
      else if (m.op === 'unitLoad') h.overrideUnitLoad(m.roomId, m.coolKcal, m.heatKcal)
      else if (m.op === 'resetUnitLoad') h.resetUnitLoad(m.roomId)
      else if (m.op === 'indoor') h.overrideIndoor(m.roomId, m.modelCode, m.quantity)
      else if (m.op === 'resetIndoor') h.resetIndoor(m.roomId)
      else if (m.op === 'move') h.moveRoomFromGrid(m.roomId, m.to)
    }
    return () => { bc.close(); bcRef.current = null }
  }, [])

  // 상태가 바뀌면 새 창에 스냅샷 재방송(편집 결과 즉시 반영).
  useEffect(() => {
    bcRef.current?.postMessage(snapshotRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

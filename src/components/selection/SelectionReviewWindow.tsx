import { useEffect, useRef, useState } from 'react'
import SelectionGrid from './SelectionGrid'
import { SELECTION_CHANNEL } from '../../presentation/generation/selectionSync'
import type { SelectionMsg, SelectionSnapshotMsg, SelectionEditMsg } from '../../presentation/generation/selectionSync'
import { buildSelectionCsv } from '../../presentation/generation/selectionCsv'
import { downloadText, CSV_BOM } from '../../presentation/download'

// 장비선정표 '새 창' 페이지 (?view=selection).
// 메인 창(생성 작업)과 BroadcastChannel로 연결 — 편집은 커맨드로 메인에 반영되고,
// 메인이 재방송하는 스냅샷으로 즉시 갱신된다. 도면 화면을 가리지 않는 것이 목적.
export default function SelectionReviewWindow() {
  const [snap, setSnap] = useState<SelectionSnapshotMsg | null>(null)
  const bcRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(SELECTION_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e: MessageEvent<SelectionMsg>) => {
      if (e.data?.type === 'table') setSnap(e.data)
    }
    bc.postMessage({ type: 'hello' } satisfies SelectionMsg) // 접속 → 메인이 현재 스냅샷 응답
    return () => { bc.close(); bcRef.current = null }
  }, [])

  const send = (msg: SelectionEditMsg) => bcRef.current?.postMessage(msg)

  if (!snap) {
    return (
      <div className="review-window">
        <div className="rw-h"><span className="mt">장비선정표</span></div>
        <div className="rw-wait">
          메인 창(생성 작업)과 연결을 기다리는 중입니다…
          <br />
          <span>이 창은 생성 작업 화면의 [⧉ 선정표 확인] 버튼으로 열어야 합니다.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="review-window">
      <div className="rw-h">
        <span className="mt">장비선정표 — 실시간 연동</span>
        <button
          className="btn sm"
          onClick={() => downloadText('장비선정표.csv', CSV_BOM + buildSelectionCsv(snap.table), 'text/csv;charset=utf-8')}
        >
          ⭳ 장비선정표.csv
        </button>
      </div>
      <SelectionGrid
        table={snap.table}
        groupOptions={snap.groupOptions}
        indoorModels={snap.indoorModelOptions}
        onRenameRoom={(roomId, name) => send({ type: 'edit', op: 'rename', roomId, name })}
        onOverrideUnitLoad={(roomId, coolKcal, heatKcal) => send({ type: 'edit', op: 'unitLoad', roomId, coolKcal, heatKcal })}
        onResetUnitLoad={(roomId) => send({ type: 'edit', op: 'resetUnitLoad', roomId })}
        onOverrideIndoor={(roomId, modelCode, quantity) => send({ type: 'edit', op: 'indoor', roomId, modelCode, quantity })}
        onResetIndoor={(roomId) => send({ type: 'edit', op: 'resetIndoor', roomId })}
        onMoveRoom={(roomId, to) => send({ type: 'edit', op: 'move', roomId, to })}
      />
    </div>
  )
}

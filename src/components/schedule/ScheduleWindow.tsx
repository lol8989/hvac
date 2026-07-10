// 장비일람표 '새 창' 페이지 (?view=schedule).
//
// 컬럼이 24~31개라 도면 화면 안에서는 볼 수 없다. 별도 창에서 계열별 탭으로 훑는다.
// 메인 창(생성 작업)이 BroadcastChannel로 시트 스냅샷을 방송한다. 읽기 전용이라 편집 커맨드가 없다.

import { useEffect, useState } from 'react'
import { SCHEDULE_CHANNEL } from '../../presentation/generation/scheduleSync'
import type { ScheduleMsg, ScheduleSnapshotMsg } from '../../presentation/generation/scheduleSync'
import { downloadScheduleXlsx } from '../../presentation/generation/scheduleXlsx'

export default function ScheduleWindow() {
  const [snap, setSnap] = useState<ScheduleSnapshotMsg | null>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(SCHEDULE_CHANNEL)
    bc.onmessage = (e: MessageEvent<ScheduleMsg>) => {
      const msg = e.data
      if (msg?.type !== 'sheets') return
      setSnap(msg)
      setActive((i) => Math.min(i, Math.max(0, msg.sheets.length - 1)))
    }
    bc.postMessage({ type: 'hello' } satisfies ScheduleMsg) // 접속 → 메인이 현재 스냅샷 응답
    return () => bc.close()
  }, [])

  if (!snap) {
    return (
      <div className="review-window">
        <div className="rw-h">
          <span className="mt">장비일람표</span>
        </div>
        <div className="rw-wait">
          메인 창(생성 작업)과 연결을 기다리는 중입니다…
          <br />
          <span>이 창은 생성 작업 화면의 [⧉ 일람표 확인] 버튼으로 열어야 합니다.</span>
        </div>
      </div>
    )
  }

  if (!snap.sheets.length) {
    return (
      <div className="review-window">
        <div className="rw-h">
          <span className="mt">장비일람표</span>
        </div>
        <div className="rw-wait">아직 선정된 장비가 없습니다 — 실내기 배치·조합을 먼저 진행하세요.</div>
      </div>
    )
  }

  const sheet = snap.sheets[active]

  return (
    <div className="review-window">
      <div className="rw-h">
        <span className="mt">장비일람표</span>
        <div className="sch-tabs" role="tablist" aria-label="계열별 시트">
          {snap.sheets.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={i === active}
              className={'btn sm' + (i === active ? ' primary' : '')}
              onClick={() => setActive(i)}
            >
              {s.name} <span className="sch-count">{s.rows.length}</span>
            </button>
          ))}
        </div>
        <div className="sp" />
        <button className="btn sm" onClick={() => void downloadScheduleXlsx(snap.sheets)}>
          ⭳ 장비일람표.xlsx
        </button>
      </div>

      <div className="sch-wrap">
        <table className="sch-table">
          <thead>
            <tr>
              {sheet.columns.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((v, ci) => (
                  // 값이 없는 셀은 흐리게 — 24~31컬럼에서 채워진 칸이 먼저 눈에 들어와야 한다.
                  <td key={ci} className={v === '-' ? 'sch-dash' : undefined}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

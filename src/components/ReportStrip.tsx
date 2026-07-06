import type { ReactNode } from 'react'
import { ratioOf, groupOfRoom } from '../data'
import type { Room } from '../data'
import type { GroupView } from '../presentation/generation/planAdapter'

interface ReportStripProps {
  rooms: Record<string, Room>
  groups: GroupView[]
  pool: string[]
  capByRoom: Record<string, number> // 실별 실내기 정격용량(B: 선택 장비 기준). 조합비·설치용량 산정.
  actions?: ReactNode // 우측 액션 영역(현재 단계의 CTA 버튼)
}

// 상단 조합 리포트 스트립 (용량 요약 + 우측 단계 CTA).
export default function ReportStrip({ rooms, groups, pool, capByRoom, actions }: ReportStripProps) {
  const roomIds = Object.keys(rooms)
  const total = roomIds.length
  const assigned = roomIds.filter((id) => groupOfRoom(groups, id)).length
  const odus = groups.filter((g) => g.items.length).length
  const totLoad = roomIds.reduce((a, id) => a + rooms[id].cool, 0) // 총 냉방부하(설계)
  const totCap = roomIds.reduce((a, id) => a + (capByRoom[id] ?? 0), 0) // 총 설치 용량(선택 실내기 정격)
  const cover = Math.round((assigned / total) * 100)
  const activeRatios = groups.filter((g) => g.items.length).map((g) => ratioOf(g, capByRoom))
  const avg = activeRatios.length ? activeRatios.reduce((a, b) => a + b, 0) / activeRatios.length : 0
  const over = groups.filter((g) => g.items.length && ratioOf(g, capByRoom) > 1.3).length
  const pct = Math.min(100, Math.round(avg * 100))

  return (
    <div className="report">
      <span className="lbl">조합 리포트</span>
      <div className="kpi">총 부하 <b>{totLoad.toFixed(1)}</b> kW</div>
      <div className="kpi">총 설치 용량 <b>{totCap.toFixed(1)}</b> kW</div>
      <div className="kpi">실외기 <b>{odus}</b>대</div>
      <div className="kpi">실내기 배정 <b>{assigned}</b>/{total} <span style={{ color: '#999' }}>({cover}%)</span></div>
      <div className={'kpi' + (pool.length ? ' warn' : '')}>미배정 <b>{pool.length}</b></div>
      <div className="kpi">평균 조합비 <b>{avg.toFixed(2)}</b> <span className="gauge"><i style={{ width: pct + '%' }} /></span></div>
      <div className={'kpi' + (over ? ' warn' : '')}>과부하 <b>{over}</b></div>
      <div className="sp" />
      {actions}
    </div>
  )
}

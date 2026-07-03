import { ratioOf, groupOfRoom } from '../data'
import type { Room } from '../data'
import type { GroupView, ReportView } from '../presentation/generation/planAdapter'

interface ReportStripProps {
  rooms: Record<string, Room>
  groups: GroupView[]
  pool: string[]
  report: ReportView
  onAiPlace: () => void
  onOpenMap: () => void
}

// 상단 조합 리포트 스트립 (용량 요약 통합). 읽기 전용 요약 + 액션 버튼 2개.
export default function ReportStrip({ rooms, groups, pool, report, onAiPlace, onOpenMap }: ReportStripProps) {
  const roomIds = Object.keys(rooms)
  const total = roomIds.length
  const assigned = roomIds.filter((id) => groupOfRoom(groups, id)).length
  const odus = groups.filter((g) => g.items.length).length
  const tot = roomIds.reduce((a, id) => a + rooms[id].cool, 0)
  const cover = Math.round((assigned / total) * 100)
  const activeRatios = groups.filter((g) => g.items.length).map(ratioOf)
  const avg = activeRatios.length ? activeRatios.reduce((a, b) => a + b, 0) / activeRatios.length : 0
  const over = groups.filter((g) => g.items.length && ratioOf(g) > 1.3).length
  const pct = Math.min(100, Math.round(avg * 100))

  return (
    <div className="report">
      <span className="lbl">조합 리포트</span>
      <div className="kpi">총 설치 용량 <b>{tot.toFixed(1)}</b> kW</div>
      <div className="kpi">실외기 <b>{odus}</b>대</div>
      <div className="kpi">실내기 배정 <b>{assigned}</b>/{total} <span style={{ color: '#999' }}>({cover}%)</span></div>
      <div className={'kpi' + (pool.length ? ' warn' : '')}>미배정 <b>{pool.length}</b></div>
      <div className="kpi">평균 조합비 <b>{avg.toFixed(2)}</b> <span className="gauge"><i style={{ width: pct + '%' }} /></span></div>
      <div className={'kpi' + (over ? ' warn' : '')}>과부하 <b>{over}</b></div>
      <div className="kpi">총 실외기 단가 <b>{report.totalOutdoorPriceText}</b> <span style={{ color: '#999' }}>(VAT 별도)</span></div>
      <div className="kpi">고효율 1~2등급 <b>{report.highEfficiencyCount}</b>대</div>
      {report.unpricedCount > 0 && <div className="kpi warn">단가 미상 <b>{report.unpricedCount}</b>대</div>}
      <div className="sp" />
      <button className="btn sm primary" onClick={onAiPlace}>✦ AI 실내기 배치</button>
      <button className="btn sm" onClick={onOpenMap}>실외기 조합 매핑 ▸</button>
    </div>
  )
}

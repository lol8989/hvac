// 하단 상태바 — 조합 리포트(읽기 전용 KPI).
//
// Figma·draw.io처럼 요약 수치는 아래에 붙인다. 도면이 주인공이고 이 값들은 곁눈질하는 정보다.
// 조합비·과부하 판정은 도메인(OutdoorGroup.comboRatio)이 계산한 GroupView.ratio/judgement를 그대로 쓴다.

import { groupOfRoom } from '../../data'
import type { Room } from '../../data'
import type { GroupView } from '../../presentation/generation/planAdapter'

interface StatusBarProps {
  rooms: Record<string, Room>
  groups: GroupView[]
  pool: string[]
  capByRoom: Record<string, number> // 실별 실내기 정격용량(정격×대수)
}

export default function StatusBar({ rooms, groups, pool, capByRoom }: StatusBarProps) {
  const roomIds = Object.keys(rooms)
  const total = roomIds.length
  const assigned = roomIds.filter((id) => groupOfRoom(groups, id)).length
  const active = groups.filter((g) => g.items.length)
  const totLoad = roomIds.reduce((a, id) => a + rooms[id].cool, 0) // 총 냉방부하(설계)
  const totCap = roomIds.reduce((a, id) => a + (capByRoom[id] ?? 0), 0) // 총 설치 용량(선택 실내기 정격)
  const cover = total ? Math.round((assigned / total) * 100) : 0 // 검출 전(실 0)엔 NaN 방지
  const avg = active.length ? active.reduce((a, g) => a + g.ratio, 0) / active.length : 0
  const over = active.filter((g) => g.judgement === 'OVERLOADED').length

  return (
    <div className="statusbar" role="status" aria-label="조합 리포트">
      <span className="sb-lbl">조합 리포트</span>
      <span className="sb-item">총 부하 <b>{totLoad.toFixed(1)}</b> kW</span>
      <span className="sb-item">총 설치 용량 <b>{totCap.toFixed(1)}</b> kW</span>
      <span className="sb-item">실외기 <b>{active.length}</b>대</span>
      <span className="sb-item">실내기 배정 <b>{assigned}</b>/{total} <span className="sb-dim">({cover}%)</span></span>
      <span className={'sb-item' + (pool.length ? ' warn' : '')}>미배정 <b>{pool.length}</b></span>
      <span className="sb-item">평균 조합비 <b>{avg.toFixed(2)}</b></span>
      <span className={'sb-item' + (over ? ' warn' : '')}>과부하 <b>{over}</b></span>
    </div>
  )
}

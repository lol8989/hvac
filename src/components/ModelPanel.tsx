import { groupOfRoom } from '../data'
import type { Room, ModelCard } from '../data'
import type { GroupView } from '../presentation/generation/planAdapter'

interface ModelPanelProps {
  rooms: Record<string, Room>
  groups: GroupView[]
  selRooms: string[]
  tab: 'in' | 'out'
  setTab: (t: 'in' | 'out') => void
  models: { in: ModelCard[]; out: ModelCard[] }
}

// 우측 패널 — 실내기/실외기 모델 선택 전용 (용량 요약은 상단 리포트로 이관).
export default function ModelPanel({ rooms, groups, selRooms, tab, setTab, models }: ModelPanelProps) {
  const roomIds = Object.keys(rooms)
  const primary = selRooms[0] // 대표 실(상세 표시용)
  const sel = primary ? rooms[primary] : undefined
  const extra = selRooms.length - 1

  return (
    <aside className="rpanel">
      <div className="rp-h">실내기 / 실외기 모델 선택 <button className="x">×</button></div>
      <div className="rp-room">
        {sel ? (
          <>
            <span>{primary} ({sel.name}){extra > 0 ? ` 외 ${extra}실` : ''}</span>
            <span>{sel.area.toFixed(2)}㎡</span>
          </>
        ) : (
          <span style={{ color: '#999' }}>선택된 실 없음</span>
        )}
      </div>
      <div className="rp-tabs">
        <button className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>실내기</button>
        <button className={tab === 'out' ? 'on' : ''} onClick={() => setTab('out')}>실외기</button>
      </div>
      <div className="rp-body">
        <div className="subttl">장비 리스트</div>
        {models[tab].map((m, i) => (
          <div key={i} className={'mcard' + (m.on ? ' on' : '')}>
            {m.on && <span className="selbadge">선택됨</span>}
            <div className="mn">{m.mn}</div>
            <div className="ms">{m.ms}</div>
            <div className="mp">{m.mp}</div>
            <div className="md">{m.md}</div>
          </div>
        ))}
        <div className="subttl" style={{ marginTop: 12 }}><b>{roomIds.length}</b>개의 선택된 장비</div>
        {roomIds.map((id) => {
          const g = groupOfRoom(groups, id)
          const on = selRooms.includes(id)
          return (
            <div key={id} className="selrow">
              <span className={'cb' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>
              <span>{id} <span style={{ color: '#999' }}>· {rooms[id].cool}kW</span></span>
              <span className="rt">{g ? g.label : '미배정'}</span>
            </div>
          )
        })}
      </div>
      <div className="rp-foot">
        <button className="btn primary">모델 적용</button>
        <button className="btn">취소</button>
      </div>
    </aside>
  )
}

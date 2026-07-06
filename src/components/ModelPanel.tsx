import { useRef } from 'react'
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
  open: boolean
  width: number
  onToggle: () => void
  onWidthChange: (w: number) => void
  onSelectRoom: (id: string) => void // 선택에서 제거(✕)
  onFocusRoom: (id: string) => void // 대표 실로 포커스(행 본문 클릭)
  selModelIdx: number
  onSelectModel: (idx: number) => void
  onApply: () => void
  indoorByRoom: Record<string, string> // 실별 적용된 실내기 모델명
  aiRooms: Set<string> // AI가 자동 선정한 실(‘AI’ 표기)
}

const MIN_W = 260
const MAX_W = 560

// 우측 패널 — 실내기/실외기 모델 선택 전용 (용량 요약은 상단 리포트로 이관).
// 헤더 ◀ 버튼으로 접기/펼치기, 좌측 경계 드래그로 폭 조절.
export default function ModelPanel({
  rooms, groups, selRooms, tab, setTab, models, open, width, onToggle, onWidthChange, onSelectRoom,
  onFocusRoom, selModelIdx, onSelectModel, onApply, indoorByRoom, aiRooms,
}: ModelPanelProps) {
  // 실별 실내기 라벨: 적용(매핑)된 모델만 표기. 미적용은 '미지정'(추천은 표시하지 않음).
  const appliedModel = (id: string): string | null => indoorByRoom[id] ?? null
  const primary = selRooms[0] // 대표 실(상세 표시용)
  const sel = primary ? rooms[primary] : undefined
  const extra = selRooms.length - 1

  // 드래그 리사이즈: 패널 좌측 경계를 잡고 좌우로 움직여 폭 조절.
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startX: e.clientX, startW: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return
      // 패널은 우측에 고정 → 핸들을 왼쪽으로 끌면 폭이 커진다.
      const next = drag.current.startW + (drag.current.startX - ev.clientX)
      onWidthChange(Math.max(MIN_W, Math.min(MAX_W, next)))
    }
    const onUp = () => {
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 접힌 상태: 얇은 세로 레일 + 펼치기 버튼.
  if (!open) {
    return (
      <aside className="rpanel collapsed">
        <button className="rp-expand" onClick={onToggle} title="패널 펼치기" aria-label="패널 펼치기">
          ◀
        </button>
        <span className="rp-vlabel">모델 선택</span>
      </aside>
    )
  }

  return (
    <aside className="rpanel" style={{ width }}>
      <div className="rp-resizer" onPointerDown={onResizeDown} title="드래그하여 폭 조절" />
      <div className="rp-h">
        <span>실내기 / 실외기 모델 선택</span>
        <button className="x" onClick={onToggle} title="패널 접기" aria-label="패널 접기">▶</button>
      </div>
      <div className="rp-room">
        {sel ? (
          <>
            <span>{primary} ({sel.name}){extra > 0 ? ` 외 ${extra}실` : ''}</span>
            <span>{sel.type} · {sel.cool}kW · {sel.area.toFixed(2)}㎡</span>
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
        {models[tab].map((m, i) => {
          const on = i === selModelIdx
          return (
          <div
            key={i}
            className={'mcard' + (on ? ' on' : '')}
            onClick={() => onSelectModel(i)}
            role="button"
            tabIndex={0}
          >
            {on && <span className="selbadge">선택됨</span>}
            <div className="mn">{m.mn}</div>
            <div className="ms">{m.ms}</div>
            <div className="mp">{m.mp}</div>
            <div className="md">{m.md}</div>
          </div>
          )
        })}
        {/* 선택된 실이 있을 때만(드래그/개별 선택) 리스트 노출. 평소엔 아예 없음. */}
        {selRooms.length > 0 && (
          <div className="subttl" style={{ marginTop: 12 }}><b>{selRooms.length}</b>개의 선택된 장비</div>
        )}
        {selRooms.filter((id) => rooms[id]).map((id) => {
          const g = groupOfRoom(groups, id)
          const model = appliedModel(id)
          return (
            <div
              key={id}
              className="selrow sel"
              onClick={() => onFocusRoom(id)}
              role="button"
              tabIndex={0}
              title="클릭하여 이 실을 대표로"
            >
              <span className="selrow-main">
                <span className="selrow-top">{id} <span style={{ color: '#999' }}>· {rooms[id].cool}kW</span></span>
                <span className={'selrow-idu' + (model ? '' : ' rec')}>
                  {model ? `${aiRooms.has(id) ? 'AI' : '실내기'} ${model}` : '미지정'}
                </span>
              </span>
              <span className="rt">{g ? g.label : '미배정'}</span>
              <button
                className="selrow-x"
                onClick={(e) => { e.stopPropagation(); onSelectRoom(id) }}
                title="선택에서 제거"
                aria-label="선택에서 제거"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <div className="rp-foot">
        <button className="btn primary" onClick={onApply}>모델 적용</button>
        <button className="btn">취소</button>
      </div>
    </aside>
  )
}

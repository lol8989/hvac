// 실외기 조합 매핑 — 하단 도킹 패널 (층 → 실외기 → 실 계층).
//
// 도면을 남겨 두고 아래에 붙는다(주인님 확정 2026-07-10). 높이 조절 가능.
//
// 계층(참고 레거시 "실외기 시스템 구성"과 동형, 재설계 2026-07-21):
//   [N층]  →  실외기 카드(모델·HP·용량·연결대수·조합비)  →  실 행(면적·칼로리·부하·실내기모델·대수)
// 데이터는 장비선정표(SelectionTable→dockView)가 계산한 값을 옮겨 표시한다(도크는 계산하지 않는다).
//
// 인터랙션:
//   - 실 행 클릭 → 도면에서 그 실 하이라이팅(onSelectRoom → selRooms → 뷰어). 다시 클릭하면 해제.
//   - 실 행 드래그 → 실외기 재배정(그룹으로) / 미배정(pool) / 선정 대기(stage)
//   - 선정 대기에 실을 모아 [+ 실외기 선정] → 그 묶음에 맞는 실외기 자동 선정(그룹 생성)
//   - 실외기 모델 교체(카탈로그)
// (분할·삭제 버튼은 없앴다 — 실을 빼면 빈 그룹은 자동 정리되고, 새 그룹은 선정으로만 생긴다.)

import { useRef, useState } from 'react'
import type { DockFloorView, DockRoomRow } from '../../presentation/generation/dockView'
import type { OutdoorModelSpec } from '../../application/generation/ports'

const MIN_H = 220
const MAX_H = 640

// 실외기 그룹별 색상 팔레트(생성 영역 무채색 규칙 예외 — 주인님 지시 2026-07-21).
// head=탭(헤더) 색(흰 글자 대비 확보), tint=실내기 행 영역 배경(연한 동일 색상).
const GROUP_PALETTE: { head: string; tint: string }[] = [
  { head: '#2f5fae', tint: '#eef3fb' }, // 블루
  { head: '#1f8a80', tint: '#e8f5f3' }, // 틸
  { head: '#a9720f', tint: '#fbf2e3' }, // 앰버
  { head: '#b23a5b', tint: '#fbebf0' }, // 로즈
  { head: '#6b4bb0', tint: '#f1edf9' }, // 바이올렛
  { head: '#2f7d3a', tint: '#eaf5ec' }, // 그린
  { head: '#1c7a95', tint: '#e7f3f7' }, // 시안
  { head: '#8a5a3c', tint: '#f4ece6' }, // 브라운
  { head: '#3f5b8a', tint: '#eef1f7' }, // 슬레이트
  { head: '#9c3d84', tint: '#f6eaf2' }, // 마젠타
]

const judgeText = (j: string): string | null => (j === 'OVERLOADED' ? '과부하' : j === 'UNDERLOADED' ? '저부하' : null)

// 휴지통 아이콘(인라인 SVG, currentColor 상속 — 무채색 유지). 실 배정 해제 버튼용.
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}

// 단위부하(kcal/h·㎡) 직접 수정 셀. 비제어 input + blur/Enter 커밋. 외부 값이 바뀌면 key로 리마운트되어 초기화된다.
// 이 값이 실제 입력이고, 부하(kW)는 면적×단위부하로 자동 재계산되는 파생값이다.
function KcalCell({ kcal, onCommit }: { kcal: number; onCommit: (kcal: number) => void }) {
  const value = String(kcal)
  return (
    <span className="c-kcal">
      <input
        key={value}
        className="loadin"
        defaultValue={value}
        inputMode="numeric"
        aria-label="단위부하(kcal) 수정"
        title="단위부하(kcal/h·㎡) 직접 수정 — 부하(kW)는 면적으로 자동 계산됩니다"
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onBlur={(e) => { const n = parseInt(e.target.value, 10); if (!Number.isNaN(n) && n > 0 && n !== kcal) onCommit(n) }}
      />
    </span>
  )
}

interface RoomRowProps {
  room: DockRoomRow
  from: string // 그룹 key | 'pool'
  selected: boolean
  onSelect: (id: string) => void
  onEditKcal: (id: string, kcal: number) => void
  onUnassign?: (id: string) => void
}

// 실 한 곳 = 컬럼 정렬 행. 클릭=도면 강조, 드래그=재배정, 단위부하(kcal)=직접 수정.
function RoomRow({ room, from, selected, onSelect, onEditKcal, onUnassign }: RoomRowProps) {
  return (
    <div
      className={'rrow' + (selected ? ' sel' : '')}
      draggable
      title={`${room.roomId} — 클릭: 도면에서 이 실 강조 · 드래그: 실외기 재배정/미배정`}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: room.roomId, from }))}
      onClick={() => onSelect(room.roomId)}
    >
      <span className="c-name">{room.name}</span>
      <span className="c-area">{room.areaM2.toFixed(1)}㎡</span>
      <KcalCell kcal={room.coolKcal} onCommit={(v) => onEditKcal(room.roomId, v)} />
      <span className="c-load">{room.loadKw.toFixed(1)}kW</span>
      <span className="c-model">{room.model ?? '—'}</span>
      <span className="c-qty">×{room.qty}</span>
      {from !== 'pool' && (
        <button
          className="c-x c-trash"
          title="이 실을 실외기에서 빼기(미배정으로)"
          aria-label="배정 해제"
          onClick={(e) => { e.stopPropagation(); onUnassign?.(room.roomId) }}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}

interface MappingDockProps {
  catalog: OutdoorModelSpec[]
  floors: DockFloorView[]
  pool: DockRoomRow[] // 미배정 실 (실외기 선정은 도면에서 선택 → 오버레이 버튼으로 한다)
  roomTotal: number
  selectedRooms: string[]
  height: number
  onHeightChange: (h: number) => void
  onSelectRoom: (id: string) => void
  onSelectGroup: (roomIds: string[]) => void // 실외기 헤더 클릭 → 그 그룹의 모든 실 하이라이팅
  onEditKcal: (id: string, kcal: number) => void // 실 단위부하(kcal) 직접 수정 (부하kW는 자동 재계산)
  onMove: (id: string, to: string) => boolean // to: 그룹 key | 'pool'
  onReplace: (key: string, spec: OutdoorModelSpec) => void
  onClose: () => void
}

export default function MappingDock({
  catalog, floors, pool, roomTotal, selectedRooms, height, onHeightChange,
  onSelectRoom, onSelectGroup, onEditKcal, onMove, onReplace, onClose,
}: MappingDockProps) {
  const [overKey, setOverKey] = useState<string | null>(null)
  const [warnKey, setWarnKey] = useState<string | null>(null)
  const sel = new Set(selectedRooms)
  const drag = useRef<{ startY: number; startH: number } | null>(null)

  const groupCount = floors.reduce((a, f) => a + f.groups.length, 0)
  const assigned = floors.reduce((a, f) => a + f.groups.reduce((b, g) => b + g.roomCount, 0), 0)

  // 그룹 key → 색상. 층을 가로지르는 순서로 배정한다.
  const groupColor = new Map<string, { head: string; tint: string }>()
  {
    let i = 0
    for (const f of floors) for (const g of f.groups) { groupColor.set(g.key, GROUP_PALETTE[i % GROUP_PALETTE.length]); i++ }
  }

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startY: e.clientY, startH: height }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    const onMoveEv = (ev: PointerEvent) => {
      if (!drag.current) return
      onHeightChange(Math.max(MIN_H, Math.min(MAX_H, drag.current.startH + (drag.current.startY - ev.clientY))))
    }
    const onUp = () => {
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', onUp)
  }

  const readPayload = (e: React.DragEvent): { id: string; from: string } | null => {
    try {
      return JSON.parse(e.dataTransfer.getData('text/plain')) as { id: string; from: string }
    } catch {
      return null
    }
  }
  const dropToGroup = (e: React.DragEvent, key: string) => {
    e.preventDefault(); setOverKey(null)
    const p = readPayload(e); if (!p) return
    if (!onMove(p.id, key)) { setWarnKey(key); setTimeout(() => setWarnKey(null), 2600) }
  }
  const dropToPool = (e: React.DragEvent) => {
    e.preventDefault(); setOverKey(null)
    const p = readPayload(e); if (!p) return
    if (p.from !== 'pool') onMove(p.id, 'pool')
  }
  const allow = (e: React.DragEvent, key: string) => { e.preventDefault(); setOverKey(key) }

  const RHead = () => (
    <div className="rhead">
      <span className="c-name">실</span>
      <span className="c-area">면적</span>
      <span className="c-kcal">kcal</span>
      <span className="c-load">부하</span>
      <span className="c-model">실내기</span>
      <span className="c-qty">대수</span>
      <span className="c-x" />
    </div>
  )

  return (
    <div className="mapdock" style={{ height }} aria-label="실외기 조합 매핑">
      <div className="md-resizer" onPointerDown={onResizeDown} title="드래그하여 높이 조절" />
      <div className="md-h">
        <span className="mt">실외기 조합 매핑</span>
        <span className="md-summ">
          실외기 {groupCount}대 · 배정 {assigned}/{roomTotal} · 미배정 {pool.length}
        </span>
        <div className="sp" />
        <button className="x" onClick={onClose} aria-label="조합 매핑 닫기">×</button>
      </div>

      <div className="md-body">
        <div className="odus">
          {floors.map((f) => (
            <div key={f.floor} className="floorsec">
              <div className="floorhd">{f.floor}</div>
              <div className="floorgroups">
              {f.groups.map((g) => {
                const pct = Math.round(g.ratio * 100)
                const barPct = Math.min(100, pct)
                const jt = judgeText(g.judgement)
                const gc = groupColor.get(g.key)
                return (
                  <div
                    key={g.key}
                    className="odu odu-colored"
                    style={gc ? ({ ['--gcolor']: gc.head, ['--gtint']: gc.tint } as React.CSSProperties) : undefined}
                  >
                    <div
                      className="oh oh-click"
                      title="이 실외기에 묶인 실들을 도면에서 모두 강조합니다"
                      onClick={() => onSelectGroup(g.rooms.map((r) => r.roomId))}
                    >
                      <span>{g.label} · {g.model}</span>
                      <span className="oh-r">
                        {g.hp}HP · {g.coolKw}kW
                        {jt && <span className="badge warn">{jt}</span>}
                      </span>
                    </div>
                    <div className="ometa">
                      <div className={'g' + (jt ? ' warn' : '')}><i style={{ width: barPct + '%' }} /></div>
                      <span>조합비 <b>{g.ratio.toFixed(2)}</b> ({pct}%) · 연결 {g.unitCount}대 ({g.roomCount}실)</span>
                    </div>
                    <div
                      className={'rtable' + (overKey === g.key ? ' dragover' : '')}
                      onDragOver={(e) => allow(e, g.key)}
                      onDragLeave={() => setOverKey(null)}
                      onDrop={(e) => dropToGroup(e, g.key)}
                    >
                      <RHead />
                      {g.rooms.map((r) => (
                        <RoomRow key={r.roomId} room={r} from={g.key} selected={sel.has(r.roomId)} onSelect={onSelectRoom} onEditKcal={onEditKcal} onUnassign={(id) => onMove(id, 'pool')} />
                      ))}
                    </div>
                    {warnKey === g.key && (
                      <div className="warnbar"><b>배정 불가:</b> 계열이 다르거나 최대 연결 대수를 넘습니다.</div>
                    )}
                    <div className="ofoot">
                      <select
                        className="field"
                        value={g.model}
                        title="실외기 교체"
                        aria-label={`${g.label} 실외기 교체`}
                        onChange={(e) => { const c = catalog.find((x) => x.model === e.target.value); if (c) onReplace(g.key, c) }}
                      >
                        {catalog.map((c) => (
                          <option key={c.model} value={c.model}>{c.model} · {c.capacityKw}kW · {c.energySource}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              })}
              {f.groups.length === 0 && <div className="floorempty">이 층은 아직 선정된 실외기가 없습니다</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="pool-col">
          <div
            className={'pool drop' + (overKey === 'pool' ? ' dragover' : '')}
            onDragOver={(e) => allow(e, 'pool')}
            onDragLeave={() => setOverKey(null)}
            onDrop={dropToPool}
          >
            <div className="ph">미배정 실 <span className="ph-c">{pool.length}</span></div>
            <div className="pbody">
              {pool.length ? (
                <>
                  <div className="poolhint">실을 클릭(또는 도면에서 드래그 선택)한 뒤 도면 위 <b>＋ 실외기 선정</b> 버튼으로 묶습니다.</div>
                  {pool.map((r) => (
                    <div key={r.roomId} className={'chip' + (sel.has(r.roomId) ? ' sel' : '')} draggable
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id: r.roomId, from: 'pool' }))}
                      onClick={() => onSelectRoom(r.roomId)}>
                      <span>{r.name} <span className="cap">×{r.qty} · {r.loadKw.toFixed(1)}kW</span></span>
                    </div>
                  ))}
                </>
              ) : (
                <div className="rempty">미배정 없음</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

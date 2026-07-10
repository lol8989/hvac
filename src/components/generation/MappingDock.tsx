// 실외기 조합 매핑 — 하단 도킹 패널.
//
// 예전에는 전체화면 모달(1180×760)이라 도면이 완전히 가려졌다. 조합은 도면 위 실내기 심볼을
// 보면서 하는 일이라, 도면을 남겨 두고 아래에 붙인다(주인님 확정 2026-07-10). 높이 조절 가능.
//
// - 드래그: 실 ↔ 실외기 배정/해제 (그 실의 모든 실내기 대수가 함께 움직인다)
// - 실외기 교체(카탈로그), 그룹 분할/삭제, 실외기 추가
// - 조합비는 도메인이 계산한 값(GroupView.ratio/judgement)을 표시한다
//
// 실 정보는 prop으로 받는다. 예전 모달은 `ROOMS` 목업을 직접 import해서
// 선정표에서 바꾼 실명이 칩에 반영되지 않았고, 칩의 kW는 설계부하라 정격 기준 조합비와 어긋나 보였다.

import { useRef, useState } from 'react'
import type { GroupView } from '../../presentation/generation/planAdapter'
import type { OutdoorModelSpec } from '../../application/generation/ports'

export interface DockRoomInfo {
  name: string
  type: string // 실내기 유형(4WAY 등)
  capKw: number // 설치 정격용량(정격 × 대수) — 조합비와 같은 기준
}

const MIN_H = 200
const MAX_H = 620

interface ChipProps {
  id: string
  from: string
  info?: DockRoomInfo
  onUnassign?: (id: string) => void
}

function Chip({ id, from, info, onUnassign }: ChipProps) {
  return (
    <div
      className="chip"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id, from }))}
    >
      <span>{id} <span className="cap">· {info?.name ?? id}{info?.type ? ` · ${info.type}` : ''} · {(info?.capKw ?? 0).toFixed(1)}kW</span></span>
      {from !== 'pool' && (
        <button className="x" title="해제" onClick={() => onUnassign?.(id)}>✕</button>
      )}
    </div>
  )
}

interface MappingDockProps {
  catalog: OutdoorModelSpec[]
  groups: GroupView[]
  pool: string[]
  roomInfo: Record<string, DockRoomInfo>
  roomTotal: number
  height: number
  onHeightChange: (h: number) => void
  onMove: (id: string, to: string) => boolean
  onReplace: (key: string, spec: OutdoorModelSpec) => void
  onSplit: (key: string) => void
  onAddGroup: (spec: OutdoorModelSpec) => void
  onRemove: (key: string) => void
  onClose: () => void
}

export default function MappingDock({
  catalog, groups, pool, roomInfo, roomTotal, height, onHeightChange,
  onMove, onReplace, onSplit, onAddGroup, onRemove, onClose,
}: MappingDockProps) {
  const [warnKey, setWarnKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [addModel, setAddModel] = useState(catalog[0]?.model ?? '')
  const assigned = groups.reduce((a, g) => a + g.items.length, 0)
  const drag = useRef<{ startY: number; startH: number } | null>(null)

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startY: e.clientY, startH: height }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    const onMoveEv = (ev: PointerEvent) => {
      if (!drag.current) return
      // 도크는 아래에 붙어 있다 → 핸들을 위로 끌면 높이가 커진다.
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

  const handleDrop = (e: React.DragEvent, to: string) => {
    e.preventDefault()
    setOverKey(null)
    let payload: { id: string; from: string }
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain')) as { id: string; from: string }
    } catch {
      return
    }
    if (!onMove(payload.id, to)) {
      setWarnKey(to)
      setTimeout(() => setWarnKey(null), 2600)
    }
  }
  const allow = (e: React.DragEvent, key: string) => {
    e.preventDefault()
    setOverKey(key)
  }
  const catOf = (model: string): OutdoorModelSpec | undefined => catalog.find((c) => c.model === model)

  return (
    <div className="mapdock" style={{ height }} aria-label="실외기 조합 매핑">
      <div className="md-resizer" onPointerDown={onResizeDown} title="드래그하여 높이 조절" />
      <div className="md-h">
        <span className="mt">실외기 조합 매핑</span>
        <span className="md-summ">
          실외기 {groups.filter((g) => g.items.length).length}대 · 배정 {assigned}/{roomTotal} · 미배정 {pool.length}
        </span>
        <div className="sp" />
        <span className="md-add">실외기 추가:</span>
        <select className="field" value={addModel} onChange={(e) => setAddModel(e.target.value)} aria-label="추가할 실외기 모델">
          {catalog.map((c) => (
            <option key={c.model} value={c.model}>{c.model} · {c.capacityKw}kW · {c.energySource}</option>
          ))}
        </select>
        <button className="btn sm" onClick={() => { const c = catOf(addModel); if (c) onAddGroup(c) }}>+ 추가</button>
        <button className="x" onClick={onClose} aria-label="조합 매핑 닫기">×</button>
      </div>

      <div className="md-body">
        <div className="odus">
          {groups.map((g) => {
            // 조합비·판정은 도메인이 계산한 값을 그대로 표시한다 — 리포트·선정표와 같은 숫자.
            const r = g.ratio
            const pct = Math.round(r * 100)
            const barPct = Math.min(100, pct) // 게이지 바 폭은 100%에서 멈춘다
            const judgement = g.items.length ? g.judgement : 'OK'
            const warn = judgement !== 'OK'
            return (
              <div key={g.key} className="odu">
                <div className="oh">
                  <span>{g.label} · {g.model}</span>
                  <span style={{ fontWeight: 400, fontSize: 11 }}>{g.cat}</span>
                </div>
                <div className="ometa">
                  {/* 연결 수는 실 개수가 아니라 실내기 '대수'다 — maxConnections와 같은 축. */}
                  용량 {g.cool}kW · 계열 {g.sys} · 연결 {g.unitCount}대 ({g.items.length}실)
                  <div style={{ marginTop: 2 }}>
                    등급 {g.gradeText ?? '—'}{g.effText ? ` · ${g.effText}` : ''}
                  </div>
                  <div className={'g' + (warn ? ' warn' : '')}><i style={{ width: barPct + '%' }} /></div>
                  <span>
                    조합비 <b>{r.toFixed(2)}</b> ({pct}%)
                    {g.items.length ? ` · 허용 ${g.comboMin.toFixed(2)}~${g.comboMax.toFixed(2)}` : null}
                    {warn && (
                      <span className="badge warn" style={{ marginLeft: 6 }}>
                        {judgement === 'OVERLOADED' ? '과부하' : '저부하'}
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className={'drop' + (overKey === g.key ? ' dragover' : '')}
                  onDragOver={(e) => allow(e, g.key)}
                  onDragLeave={() => setOverKey(null)}
                  onDrop={(e) => handleDrop(e, g.key)}
                >
                  {g.items.length ? (
                    g.items.map((id) => (
                      <Chip key={id} id={id} from={g.key} info={roomInfo[id]} onUnassign={(x) => onMove(x, 'pool')} />
                    ))
                  ) : (
                    <div style={{ color: '#bbb', fontSize: 11, padding: '6px 2px' }}>여기로 실을 드래그</div>
                  )}
                </div>
                {warnKey === g.key && (
                  <div className="warnbar"><b>배정 불가:</b> 계열이 다르거나 최대 연결 대수를 넘습니다({g.sys}).</div>
                )}
                <div className="ofoot">
                  <select
                    className="field"
                    value={g.model}
                    title="실외기 교체"
                    aria-label={`${g.label} 실외기 교체`}
                    onChange={(e) => {
                      const c = catOf(e.target.value)
                      if (c) onReplace(g.key, c)
                    }}
                  >
                    {catalog.map((c) => (
                      <option key={c.model} value={c.model}>{c.model} · {c.capacityKw}kW · {c.energySource}</option>
                    ))}
                  </select>
                  <button className="btn sm" onClick={() => onSplit(g.key)} disabled={g.items.length < 2}>분할</button>
                  <button className="btn sm" onClick={() => onRemove(g.key)}>삭제</button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="pool">
          <div className="ph">미배정 실</div>
          <div
            className={'pbody drop' + (overKey === 'pool' ? ' dragover' : '')}
            onDragOver={(e) => allow(e, 'pool')}
            onDragLeave={() => setOverKey(null)}
            onDrop={(e) => handleDrop(e, 'pool')}
          >
            {pool.length ? (
              pool.map((id) => <Chip key={id} id={id} from="pool" info={roomInfo[id]} />)
            ) : (
              <div style={{ color: '#bbb', fontSize: 11 }}>미배정 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

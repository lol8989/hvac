import { useState } from 'react'
import { ratioOf, ROOMS } from '../data'
import type { GroupView } from '../presentation/generation/planAdapter'
import { specPriceText } from '../presentation/generation/planAdapter'
import type { OutdoorModelSpec } from '../application/generation/ports'

interface ChipProps {
  id: string
  from: string
  onUnassign?: (id: string) => void
}

function Chip({ id, from, onUnassign }: ChipProps) {
  const r = ROOMS[id]
  return (
    <div
      className="chip"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ id, from }))}
    >
      <span>{id} <span className="cap">· {r.name} · {r.type} · {r.cool}kW</span></span>
      {from !== 'pool' && (
        <button className="x" title="해제" onClick={() => onUnassign?.(id)}>✕</button>
      )}
    </div>
  )
}

interface MappingModalProps {
  catalog: OutdoorModelSpec[]
  groups: GroupView[]
  pool: string[]
  capByRoom: Record<string, number> // 실별 실내기 정격용량(B: 선택 장비 기준) — 조합비 산정
  onMove: (id: string, to: string) => boolean
  onReplace: (key: string, spec: OutdoorModelSpec) => void
  onSplit: (key: string) => void
  onAddGroup: (spec: OutdoorModelSpec) => void
  onRemove: (key: string) => void
  onClose: () => void
  onApply: () => void
}

// 실외기 조합 매핑 팝업(모달).
// - 드래그: 실내기 ↔ 실외기 배정/해제
// - 실외기 교체(카탈로그), 그룹 분할/삭제, 실외기 추가
// - 조합비 실시간 계산, 호환 불가(GHP↔EHP) 경고/차단
export default function MappingModal({ catalog, groups, pool, capByRoom, onMove, onReplace, onSplit, onAddGroup, onRemove, onClose, onApply }: MappingModalProps) {
  const [warnKey, setWarnKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [addModel, setAddModel] = useState(catalog[0].model)
  const roomTotal = Object.keys(ROOMS).length
  const assigned = groups.reduce((a, g) => a + g.items.length, 0)

  const handleDrop = (e: React.DragEvent, to: string) => {
    e.preventDefault()
    setOverKey(null)
    let payload: { id: string; from: string }
    try {
      payload = JSON.parse(e.dataTransfer.getData('text/plain')) as { id: string; from: string }
    } catch {
      return
    }
    const ok = onMove(payload.id, to)
    if (!ok) {
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
    <div
      className="overlay"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).classList.contains('overlay')) onClose()
      }}
    >
      <div className="modal">
        <div className="m-h">
          <span className="mt">실외기 조합 매핑</span>
          <button className="x" onClick={onClose}>×</button>
        </div>
        <div className="m-note">
          미배정 실내기를 실외기 카드로 <b>드래그</b>해 조합을 구성합니다. 조합비가 실시간 계산되고,
          호환 불가(GHP ↔ EHP)는 경고로 차단됩니다. 호환 판단은 <b>장비마스터의 제품군·계열 정보</b> 기준입니다.
        </div>

        <div className="m-toolbar">
          <span>실외기 추가:</span>
          <select className="field" value={addModel} onChange={(e) => setAddModel(e.target.value)}>
            {catalog.map((c) => {
              const pt = specPriceText(c)
              return (
                <option key={c.model} value={c.model}>{c.model} · {c.capacityKw}kW · {c.energySource}{pt ? ` · ${pt}` : ''}</option>
              )
            })}
          </select>
          <button className="btn sm" onClick={() => { const c = catOf(addModel); if (c) onAddGroup(c) }}>+ 추가</button>
        </div>

        <div className="m-body">
          <div className="odus">
            {groups.map((g) => {
              const r = ratioOf(g, capByRoom)
              const pct = Math.min(100, Math.round(r * 100))
              const warn = g.items.length && (r > 1.3 || r < 0.5)
              return (
                <div key={g.key} className="odu">
                  <div className="oh">
                    <span>{g.label} · {g.model}</span>
                    <span style={{ fontWeight: 400, fontSize: 11 }}>{g.cat}</span>
                  </div>
                  <div className="ometa">
                    용량 {g.cool}kW · 계열 {g.sys} · 연결 {g.items.length}
                    <div style={{ marginTop: 2 }}>
                      단가 <b>{g.priceText ?? '미상'}</b> · 등급 {g.gradeText ?? '—'}{g.effText ? ` · ${g.effText}` : ''}
                    </div>
                    <div className={'g' + (warn ? ' warn' : '')}><i style={{ width: pct + '%' }} /></div>
                    조합비 {r.toFixed(2)} {warn ? <span>· <b>범위(0.5~1.3) 벗어남</b></span> : null}
                  </div>
                  <div
                    className={'drop' + (overKey === g.key ? ' dragover' : '')}
                    onDragOver={(e) => allow(e, g.key)}
                    onDragLeave={() => setOverKey(null)}
                    onDrop={(e) => handleDrop(e, g.key)}
                  >
                    {g.items.length ? (
                      g.items.map((id) => (
                        <Chip key={id} id={id} from={g.key} onUnassign={(x) => onMove(x, 'pool')} />
                      ))
                    ) : (
                      <div style={{ color: '#bbb', fontSize: 11, padding: '6px 2px' }}>여기로 실내기를 드래그</div>
                    )}
                  </div>
                  {warnKey === g.key && (
                    <div className="warnbar"><b>호환 불가:</b> 이 실외기({g.sys})에는 연결할 수 없는 실내기 계열입니다.</div>
                  )}
                  <div className="ofoot">
                    <select
                      className="field"
                      value={g.model}
                      title="실외기 교체"
                      onChange={(e) => {
                        const c = catOf(e.target.value)
                        if (c) onReplace(g.key, c)
                      }}
                    >
                      {catalog.map((c) => {
                        const pt = specPriceText(c)
                        return (
                          <option key={c.model} value={c.model}>{c.model} · {c.capacityKw}kW · {c.energySource}{pt ? ` · ${pt}` : ''}</option>
                        )
                      })}
                    </select>
                    <button className="btn sm" onClick={() => onSplit(g.key)} disabled={g.items.length < 2}>분할</button>
                    <button className="btn sm" onClick={() => onRemove(g.key)}>삭제</button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="pool">
            <div className="ph">미배정 실내기</div>
            <div
              className={'pbody drop' + (overKey === 'pool' ? ' dragover' : '')}
              onDragOver={(e) => allow(e, 'pool')}
              onDragLeave={() => setOverKey(null)}
              onDrop={(e) => handleDrop(e, 'pool')}
            >
              {pool.length ? (
                pool.map((id) => <Chip key={id} id={id} from="pool" />)
              ) : (
                <div style={{ color: '#bbb', fontSize: 11 }}>미배정 없음</div>
              )}
            </div>
          </div>
        </div>

        <div className="m-f">
          <span className="summ">
            실외기 {groups.filter((g) => g.items.length).length}대 · 배정 {assigned}/{roomTotal} · 미배정 {pool.length}
          </span>
          <div className="sp" />
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={onApply}>조합 적용</button>
        </div>
      </div>
    </div>
  )
}

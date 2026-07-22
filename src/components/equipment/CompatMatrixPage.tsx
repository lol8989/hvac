// 실내외기 조합관리 — 실외기 시리즈 하나를 고르면, 그 시리즈에 연결 가능한 실내기 유형을 고른다.
//
// 이 표는 '무엇이 물리적으로 연결 가능한가'의 기준데이터다(현업 확정 조합표가 원천).
// 실제 조합(어떤 실내기를 어느 실외기에 묶을지)·조합비는 생성 단이 이 표를 참조해 판단한다(CLAUDE.md §1).
// 화면은 렌더·선택만 책임진다 — 값 검증·저장은 admin 포트(도메인 CompatMatrix)가 맡는다(SRP).

import { useMemo, useState } from 'react'
import type { EquipmentAdminRepository } from '../../application/equipment/adminPorts'
import type { CompatAxis, CompatMatrix, CompatValue } from '../../domain/equipment/CompatMatrix'
import AdminShell from './AdminShell'
import { useToast } from './useToast'

type Axis = CompatAxis
// 화면 선택·React 키 용도의 식별자(도메인 키가 아니다 — 표시 전용).
const axisId = (a: Pick<Axis, 'subcategory' | 'series'>) => `${a.subcategory}|${a.series}`
const isConnected = (v: CompatValue) => v === 'O' || v === 'D'

// 실외기 행을 계열(EnergySource)로 묶는다(등장 순서 유지).
function groupByEnergy(rows: readonly Axis[]): { energy: string; rows: Axis[] }[] {
  const order: string[] = []
  const map = new Map<string, { energy: string; rows: Axis[] }>()
  for (const r of rows) {
    if (!map.has(r.energySource)) {
      map.set(r.energySource, { energy: r.energySource, rows: [] })
      order.push(r.energySource)
    }
    map.get(r.energySource)!.rows.push(r)
  }
  return order.map((e) => map.get(e)!)
}

// 선택된 실외기의 실내기 목록을 중분류로 묶고, '멀티 대상 아님(-)'은 뺀다.
function buildDetail(matrix: CompatMatrix, outdoor: Axis) {
  const cells = matrix.indoorColumns.map((indoor) => ({ indoor, value: matrix.valueAt(outdoor, indoor) }))
  const editable = cells.filter((x) => x.value !== '-')
  const groups: { subcategory: string; items: { indoor: Axis; value: CompatValue }[] }[] = []
  const idx = new Map<string, number>()
  for (const x of editable) {
    if (!idx.has(x.indoor.subcategory)) {
      idx.set(x.indoor.subcategory, groups.length)
      groups.push({ subcategory: x.indoor.subcategory, items: [] })
    }
    groups[idx.get(x.indoor.subcategory)!].items.push(x)
  }
  return {
    groups,
    isMultiTarget: editable.length > 0,
    hiddenNA: cells.length - editable.length,
    connectable: cells.filter((x) => isConnected(x.value)).length,
    editableCount: editable.length,
  }
}

// 첫 화면은 실내기가 가장 많이 붙는 대표 멀티(냉난방 절환형)로 연다 — 빈/특수 시리즈로 시작하지 않는다.
const defaultOutdoorId = (m: CompatMatrix) => {
  const pick = m.outdoorRows.find((r) => r.subcategory === '냉난방 절환형') ?? m.outdoorRows.find((r) => r.energySource === 'EHP') ?? m.outdoorRows[0]
  return axisId(pick ?? { subcategory: '', series: '' })
}

export default function CompatMatrixPage({ admin }: { admin: EquipmentAdminRepository }) {
  const [matrix, setMatrix] = useState(() => admin.getCompatMatrix())
  const [selectedId, setSelectedId] = useState(() => defaultOutdoorId(matrix))
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const { toast, notify } = useToast(2600)

  const groups = useMemo(() => groupByEnergy(matrix.outdoorRows), [matrix])
  const needle = q.trim().toLowerCase()
  const matches = (r: Axis) => !needle || r.series.toLowerCase().includes(needle) || r.subcategory.toLowerCase().includes(needle)

  const selected = matrix.outdoorRows.find((r) => axisId(r) === selectedId) ?? matrix.outdoorRows[0]
  const detail = useMemo(() => buildDetail(matrix, selected), [matrix, selected])

  const toggle = (indoor: Axis, checked: boolean) => {
    const next: CompatValue = checked ? 'O' : 'X'
    try {
      admin.setCompatCell(selected, indoor, next)
      setMatrix((prev) => prev.withValue(selected, indoor, next))
      notify(`${selected.series} × ${indoor.series} → ${checked ? '연결 가능' : '불가'}`)
    } catch (e) {
      notify(e instanceof Error ? e.message : '저장에 실패했습니다')
    }
  }

  const resetSeries = () => {
    try {
      admin.clearCompatForOutdoor(selected)
      setMatrix(admin.getCompatMatrix())
      notify(`${selected.series} — 확정 기본값으로 되돌렸습니다`)
    } catch (e) {
      notify(e instanceof Error ? e.message : '되돌리기에 실패했습니다')
    }
  }

  const toggleCollapse = (energy: string) =>
    setCollapsed((prev) => {
      const nextSet = new Set(prev)
      if (nextSet.has(energy)) nextSet.delete(energy)
      else nextSet.add(energy)
      return nextSet
    })

  return (
    <AdminShell active="compat">
      <p className="cm-note">
        실외기 시리즈별로 연결 가능한 실내기 유형을 관리합니다. 왼쪽에서 <b>실외기 시리즈</b>를 고르면, 그 시리즈에 <b>연결 가능한 실내기 유형</b>을 오른쪽에서 켜고 끕니다.
      </p>

      <div className="cm-split">
        <aside className="cm-list" aria-label="실외기 시리즈 목록">
          <div className="cm-list-search">
            <input className="field" aria-label="실외기 시리즈·중분류 검색" placeholder="실외기 시리즈·중분류 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="cm-list-scroll">
            {groups.map((g) => {
              const items = g.rows.filter(matches)
              if (needle && items.length === 0) return null
              const open = needle ? true : !collapsed.has(g.energy)
              return (
                <div className="cm-group" key={g.energy}>
                  <button type="button" className="cm-group-h" aria-expanded={open} onClick={() => toggleCollapse(g.energy)}>
                    <span className="cm-caret" aria-hidden="true">
                      {open ? '▾' : '▸'}
                    </span>
                    <span className="cm-group-name">{g.energy}</span>
                    <span className="cm-group-count">{g.rows.length}</span>
                  </button>
                  {open &&
                    items.map((r) => {
                      const on = axisId(r) === axisId(selected)
                      return (
                        <button
                          type="button"
                          key={axisId(r)}
                          className={'cm-item' + (on ? ' on' : '')}
                          aria-current={on ? 'true' : undefined}
                          onClick={() => setSelectedId(axisId(r))}
                        >
                          <span className="cm-item-ser">{r.series}</span>
                          <span className="cm-item-sub">{r.subcategory}</span>
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </aside>

        <section className="cm-detail" aria-label="연결 가능한 실내기">
          <header className="cm-detail-h">
            <div>
              <h2 className="cm-detail-title">{selected.series}</h2>
              <div className="cm-detail-meta">
                <span className="cm-es">{selected.energySource}</span>
                {selected.subcategory}
                {detail.isMultiTarget && <span className="cm-detail-count"> · 연결 {detail.connectable}/{detail.editableCount}</span>}
              </div>
            </div>
            <button type="button" className="btn sm" onClick={resetSeries}>
              확정 기본값 복원
            </button>
          </header>

          {!detail.isMultiTarget ? (
            <p className="cm-empty-detail">이 실외기는 멀티(실외기 1대 ↔ 실내기 여러 대) 조합 대상이 아닙니다 — 단품·칠러 등.</p>
          ) : (
            <div className="cm-detail-scroll">
              {detail.groups.map((grp) => (
                <fieldset className="cm-sub" key={grp.subcategory}>
                  <legend className="cm-sub-h">{grp.subcategory}</legend>
                  <div className="cm-checks">
                    {grp.items.map(({ indoor, value }) => (
                      <label className={'cm-check' + (isConnected(value) ? ' on' : '')} key={axisId(indoor)}>
                        <input type="checkbox" checked={isConnected(value)} onChange={(e) => toggle(indoor, e.target.checked)} />
                        <span className="cm-check-label">{indoor.series || '기본'}</span>
                        {value === 'D' && <span className="cm-tag" title="전용 실내기만 연결 (연결 가능으로 취급)">전용</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              {detail.hiddenNA > 0 && <p className="cm-na-note">멀티 대상이 아닌 실내기 {detail.hiddenNA}종은 숨겼습니다(단품 등 1:1 전용).</p>}
            </div>
          )}
        </section>
      </div>

      <div className={'toast' + (toast ? ' show' : '')} role="status">
        {toast}
      </div>
    </AdminShell>
  )
}

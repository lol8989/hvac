// 조합비 정책 화면 — 전역 기본 + 실외기 모델별 override (주인님 지시 2026-07-10).
//
// 조합비 = Σ(연결 실내기 냉방용량) ÷ 실외기 용량. 이 화면의 값이 곧 생성단 경고선이다.
// 정책은 스펙이 아니라서 게시본(PUBLISHED)도 조정할 수 있다.

import { useMemo, useState } from 'react'
import type { EquipmentAdminRepository, ProductRow } from '../../application/equipment/adminPorts'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'
import { ComboRange } from '../../domain/shared/ComboRange'
import { toPercentLabel } from '../../presentation/equipment/comboFormat'
import AdminShell from './AdminShell'
import ComboGlobalForm from './ComboGlobalForm'
import ComboOverrideRow from './ComboOverrideRow'
import { useSubmitGuard } from './useSubmitGuard'
import { useToast } from './useToast'
import { usePagedFilter } from './usePagedFilter'

const PAGE_SIZE = 20

export default function ComboPolicyPage({ admin }: { admin: EquipmentAdminRepository }) {
  const [policy, setPolicy] = useState(() => admin.getComboPolicy())
  const [outdoor] = useState<ProductRow[]>(() => admin.listProducts().filter((r) => r.categoryCode === 'OUTDOOR'))
  const [energy, setEnergy] = useState('ALL')
  const [seriesCode, setSeriesCode] = useState('ALL')
  const [status, setStatus] = useState<'ALL' | PublishStatus>('ALL')
  const [source, setSource] = useState<'ALL' | 'OVERRIDE' | 'GLOBAL'>('ALL')
  const { qInput, setQInput, q, setPage, submitSearch, resetQuery, resetPage, paginate } = usePagedFilter(PAGE_SIZE)
  const { toast, notify } = useToast(2600)
  const guard = useSubmitGuard()

  const refresh = () => setPolicy(admin.getComboPolicy())

  // 실외기 목록에서 실제로 쓰이는 계열·시리즈만 선택지로 낸다(빈 옵션을 만들지 않는다).
  const energyOptions = useMemo(() => [...new Set(outdoor.map((r) => r.energySource).filter((e): e is string => !!e))].sort(), [outdoor])
  const seriesOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of outdoor) if (energy === 'ALL' || r.energySource === energy) seen.set(r.seriesCode, r.seriesName)
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]))
  }, [outdoor, energy])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return outdoor.filter((r) => {
      if (energy !== 'ALL' && r.energySource !== energy) return false
      if (seriesCode !== 'ALL' && r.seriesCode !== seriesCode) return false
      if (status !== 'ALL' && r.status !== status) return false
      if (source === 'OVERRIDE' && !policy.hasOverride(r.modelCode)) return false
      if (source === 'GLOBAL' && policy.hasOverride(r.modelCode)) return false
      if (needle && !r.modelCode.toLowerCase().includes(needle) && !r.seriesName.toLowerCase().includes(needle)) return false
      return true
    })
  }, [outdoor, q, energy, seriesCode, status, source, policy])

  const filterOn = q !== '' || qInput !== '' || energy !== 'ALL' || seriesCode !== 'ALL' || status !== 'ALL' || source !== 'ALL'
  const resetFilters = () => {
    resetQuery()
    setEnergy('ALL')
    setSeriesCode('ALL')
    setStatus('ALL')
    setSource('ALL')
  }
  const onFilter = resetPage

  const { pageCount, cur, rows } = paginate(filtered)

  const saveGlobal = (range: ComboRange) =>
    void guard.run(() => {
      try {
        admin.saveGlobalComboRange(range)
        refresh()
        notify(`전역 기본을 ${toPercentLabel(range.min)} ~ ${toPercentLabel(range.max)}로 저장했습니다`)
      } catch (e) {
        notify(e instanceof Error ? e.message : '저장에 실패했습니다')
      }
    })

  const saveOverride = (modelCode: string, range: ComboRange | null) => {
    try {
      admin.setProductComboRange(modelCode, range)
      refresh()
      notify(range === null ? `${modelCode} — 전역 기본으로 되돌렸습니다` : `${modelCode} — ${toPercentLabel(range.min)} ~ ${toPercentLabel(range.max)} 저장`)
    } catch (e) {
      notify(e instanceof Error ? e.message : '저장에 실패했습니다')
    }
  }

  const overrideCount = policy.overrideEntries().length

  return (
    <AdminShell active="combo">
      {/* key: 전역 기본이 바뀌면 폼을 새로 만들어 입력창을 저장값에 맞춘다 */}
      <ComboGlobalForm key={`${policy.global.min}-${policy.global.max}`} global={policy.global} busy={guard.busy} onSave={saveGlobal} />

      {/* 검색은 버튼·Enter로 확정한다(입력할 때마다 865행을 다시 거르지 않는다). */}
      <form className="eq-searchbar" role="search" onSubmit={submitSearch}>
        <input
          className="field eq-search"
          aria-label="실외기 모델명·시리즈 검색"
          placeholder="실외기 모델명·시리즈 검색"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
        />
        <button className="btn sm" type="submit">검색</button>
        <button className="btn sm" type="button" onClick={resetFilters} disabled={!filterOn}>초기화</button>
        <div className="sp" />
        <span className="eq-count">
          모델별 예외 <b>{overrideCount}</b>건
        </span>
      </form>

      <div className="eq-filterbar">
        <select className="field" aria-label="계열 필터" value={energy} onChange={(e) => { onFilter(setEnergy)(e.target.value); setSeriesCode('ALL') }}>
          <option value="ALL">전체 계열</option>
          {energyOptions.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select className="field" aria-label="시리즈 필터" value={seriesCode} onChange={(e) => onFilter(setSeriesCode)(e.target.value)}>
          <option value="ALL">전체 시리즈</option>
          {seriesOptions.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <select className="field" aria-label="상태 필터" value={status} onChange={(e) => onFilter(setStatus)(e.target.value as typeof status)}>
          <option value="ALL">전체 상태</option>
          <option value="PUBLISHED">게시</option>
          <option value="DRAFT">작성중</option>
          <option value="ARCHIVED">단종</option>
        </select>
        {/* 이 화면 고유의 축 — 어느 실외기가 기본값에서 벗어나 있는지 바로 추린다. */}
        <select className="field" aria-label="적용 출처 필터" value={source} onChange={(e) => onFilter(setSource)(e.target.value as typeof source)}>
          <option value="ALL">전체 출처</option>
          <option value="OVERRIDE">모델별 예외</option>
          <option value="GLOBAL">전역 기본</option>
        </select>
      </div>

      <div className="eq-table-wrap">
        <table className="eq-table">
          <thead>
            <tr>
              <th>모델명</th>
              <th>시리즈</th>
              <th>상태</th>
              <th className="num">적용 하한</th>
              <th className="num">적용 상한</th>
              <th>출처</th>
              <th>조정</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="eq-empty">
                  조건에 맞는 실외기가 없습니다
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <ComboOverrideRow
                  key={r.id}
                  row={r}
                  range={policy.rangeFor(r.modelCode)}
                  overridden={policy.hasOverride(r.modelCode)}
                  onSave={saveOverride}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="eq-foot">
        <span className="eq-foot-total">
          실외기 {filtered.length.toLocaleString()}종 중 {rows.length}종 표시
        </span>
        <div className="sp" />
        <button className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
          ← 이전
        </button>
        <span className="eq-foot-page">
          {cur + 1} / {pageCount}
        </span>
        <button className="btn sm" disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>
          다음 →
        </button>
      </div>

      <div className={'toast' + (toast ? ' show' : '')} role="status">
        {toast}
      </div>
    </AdminShell>
  )
}

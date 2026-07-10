import { useCallback, useMemo, useState } from 'react'
import type { BulkStatusResult, EquipmentAdminRepository, ProductRow } from '../../application/equipment/adminPorts'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'
import ProductFormModal from './ProductFormModal'
import SpecSheetUploadModal from './SpecSheetUploadModal'
import BulkActionBar from './BulkActionBar'
import AdminShell from './AdminShell'
import StatusFilterChips from './StatusFilterChips'
import SortableTh from './SortableTh'
import { sortRows, nextSortDirection, type SortKey, type SortState } from '../../presentation/equipment/sortRows'
import { useSubmitGuard } from './useSubmitGuard'
import { formatDateTime } from '../../presentation/formatDateTime'

// 게시 상태 라벨(무채색 뱃지). 관리 목록은 전 상태를 노출한다.
const STATUS_LABEL: Record<PublishStatus, string> = { DRAFT: '작성중', PUBLISHED: '게시', ARCHIVED: '단종' }
const kw = (w: number | null) => (w == null ? '—' : (Math.round(w / 100) / 10).toFixed(1))
const hp = (n: number | null) => (n == null ? '—' : String(n))

// 냉방용량 환산으로 백필한 마력은 실측이 아니다 → 목록에서 구분해 표기한다.
const HP_ESTIMATED_TITLE = '냉방용량 환산 추정치 (실측 아님)'

// 표시 건수(페이지 크기) 선택지. 첫 값이 기본값이다.
const PAGE_SIZES = [20, 30, 50, 100] as const

// 상태별 행 전이 액션. DRAFT: 등록 취소 / PUBLISHED: 단종 (둘 다 →ARCHIVED) / ARCHIVED: 재게시.
// 게시(DRAFT→PUBLISHED)는 행 버튼 없이 일괄 게시 바에서만 수행한다(실수 게시 방지 + 전제조건 사유 일괄 안내).
const ACTIONS: Record<PublishStatus, ReadonlyArray<{ to: PublishStatus; label: string }>> = {
  DRAFT: [{ to: 'ARCHIVED', label: '등록 취소' }],
  PUBLISHED: [{ to: 'ARCHIVED', label: '단종' }],
  ARCHIVED: [{ to: 'PUBLISHED', label: '재게시' }],
}

type Editing = { mode: 'create' } | { mode: 'edit'; row: ProductRow } | null

// 장비마스터 관리 페이지 (목록/필터/등록·수정/게시전이).
export default function EquipmentAdminPage({ admin }: { admin: EquipmentAdminRepository }) {
  const [all, setAll] = useState<ProductRow[]>(() => admin.listProducts())
  const series = useMemo(() => admin.listSeries(), [admin])
  const [cat, setCat] = useState<'ALL' | 'INDOOR' | 'OUTDOOR' | 'VENT'>('ALL')
  const [status, setStatus] = useState<'ALL' | PublishStatus>('ALL')
  const [seriesCode, setSeriesCode] = useState('ALL')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [sort, setSort] = useState<SortState>(null)
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set())
  const [editing, setEditing] = useState<Editing>(null)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const rowGuard = useSubmitGuard() // 행 액션(게시/보관/재게시) 연타 방지

  const refresh = useCallback(() => setAll(admin.listProducts()), [admin])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  // 행 전이 액션: 도메인 예외는 토스트로 안내하고 목록 상태는 되돌리지 않는다(저장소가 롤백).
  const changeStatus = (row: ProductRow, next: PublishStatus, label: string) =>
    void rowGuard.run(() => {
      try {
        admin.setStatus(row.id, next)
        refresh()
        notify(`${row.modelCode} — ${label} 완료`)
      } catch (e) {
        notify(e instanceof Error ? e.message : `${label}에 실패했습니다`)
      }
    })

  const filtered = useMemo<ProductRow[]>(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(
      (r) =>
        (cat === 'ALL' || r.categoryCode === cat) &&
        (status === 'ALL' || r.status === status) &&
        (seriesCode === 'ALL' || r.seriesCode === seriesCode) &&
        (!needle || r.modelCode.toLowerCase().includes(needle) || (r.equipmentCode ?? '').toLowerCase().includes(needle)),
    )
  }, [all, cat, status, seriesCode, q])

  // 정렬은 필터 다음, 페이지 나누기 앞이다 — 전체 결과를 기준으로 줄을 세운 뒤 잘라야 한다.
  const ordered = useMemo(() => sortRows(filtered, sort), [filtered, sort])

  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize))
  const cur = Math.min(page, pageCount - 1)
  const rows = ordered.slice(cur * pageSize, cur * pageSize + pageSize)
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0) }

  // 정렬을 바꾸면 보고 있던 페이지의 내용이 완전히 달라진다 → 첫 페이지로.
  const onSort = (key: SortKey) => {
    setSort((curSort) => nextSortDirection(curSort, key))
    setPage(0)
  }

  // 선택은 필터 결과 안에서만 유효하다(필터를 바꾸면 보이지 않는 선택이 남지 않도록 정리).
  const visibleSelected = useMemo(() => filtered.filter((r) => selected.has(r.id)).map((r) => r.id), [filtered, selected])
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const allFilteredSelected = filtered.length > 0 && visibleSelected.length === filtered.length

  const toggleOne = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (pageAllSelected) rows.forEach((r) => next.delete(r.id))
      else rows.forEach((r) => next.add(r.id))
      return next
    })

  const applyBulk = (next: PublishStatus): BulkStatusResult => admin.setStatusMany(visibleSelected, next)

  const reportBulk = (res: BulkStatusResult, label: string) => {
    refresh()
    setSelected(new Set())
    const head = `${label} — ${res.applied}건 적용`
    if (!res.skipped.length) return notify(head)
    const sample = res.skipped[0]
    notify(`${head}, ${res.skipped.length}건 제외 (예: ${sample.modelCode} — ${sample.reason})`)
  }

  const counts = useMemo(() => {
    const c = { PUBLISHED: 0, DRAFT: 0, ARCHIVED: 0 } as Record<PublishStatus, number>
    for (const r of all) c[r.status]++
    return c
  }, [all])

  const filterOn = cat !== 'ALL' || seriesCode !== 'ALL' || status !== 'ALL' || q !== ''
  const resetFilters = () => {
    setCat('ALL')
    setSeriesCode('ALL')
    setStatus('ALL')
    setQ('')
    setPage(0)
  }

  return (
    <AdminShell
      active="products"
      description="게시(PUBLISHED)된 모델만 생성·검도에 노출됩니다."
      actions={
        <>
          <button className="btn" onClick={() => setUploading(true)}>스펙시트 업로드</button>
          <button className="btn primary" onClick={() => setEditing({ mode: 'create' })}>＋ 제품 등록</button>
        </>
      }
    >
      {/* 상태 요약 = 상태 필터. 관리자의 첫 질문은 "지금 몇 건이 게시 대기 중인가"다. */}
      <StatusFilterChips counts={counts} total={all.length} value={status} onChange={resetPage(setStatus)} />

      {/* 탐색 전용 툴바 — 생성 액션(등록·업로드)과 표시 설정(건수)은 여기 두지 않는다. */}
      <div className="eq-toolbar" role="search">
        <input className="field eq-search" aria-label="모델명·장비번호 검색" placeholder="모델명·장비번호 검색" value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
        <select className="field" aria-label="분류 필터" value={cat} onChange={(e) => resetPage(setCat)(e.target.value as typeof cat)}>
          <option value="ALL">전체 분류</option>
          <option value="INDOOR">실내기</option>
          <option value="OUTDOOR">실외기</option>
          <option value="VENT">환기</option>
        </select>
        <select className="field" aria-label="시리즈 필터" value={seriesCode} onChange={(e) => resetPage(setSeriesCode)(e.target.value)}>
          <option value="ALL">전체 시리즈</option>
          {series
            .filter((s) => cat === 'ALL' || s.categoryCode === cat)
            .map((s) => (
              <option key={s.code} value={s.code}>
                {s.subcategoryName} — {s.nameKo}
              </option>
            ))}
        </select>
        {/* 건수는 상태 칩(전체 기준)과 하단 표기(현재 범위)가 이미 말한다 — 여기서 세 번째로 반복하지 않는다. */}
        <button className="btn sm" onClick={resetFilters} disabled={!filterOn}>초기화</button>
      </div>

      <BulkActionBar
        selectedCount={visibleSelected.length}
        filteredCount={filtered.length}
        allFilteredSelected={allFilteredSelected}
        onSelectAllFiltered={() => setSelected(new Set(filtered.map((r) => r.id)))}
        onClear={() => setSelected(new Set())}
        onApply={applyBulk}
        onResult={reportBulk}
      />

      <div className="eq-table-wrap">
        <table className="eq-table">
          <thead>
            <tr>
              <th className="chk">
                <input type="checkbox" checked={pageAllSelected} onChange={togglePage} aria-label="이 페이지 전체 선택" />
              </th>
              <SortableTh label="상태" sortKey="status" sort={sort} onSort={onSort} />
              <th>분류</th><th>계열</th><th>시리즈</th><th>모델명</th><th>장비번호</th>
              <SortableTh label="HP" sortKey="horsepower" sort={sort} onSort={onSort} numeric />
              <SortableTh label="냉방(kW)" sortKey="coolingW" sort={sort} onSort={onSort} numeric />
              <th className="num">난방(kW)</th>
              <SortableTh label="등록일" sortKey="createdAt" sort={sort} onSort={onSort} />
              <SortableTh label="수정일" sortKey="updatedAt" sort={sort} onSort={onSort} />
              <SortableTh label="게시일" sortKey="publishedAt" sort={sort} onSort={onSort} />
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={14} className="eq-empty">조건에 맞는 제품이 없습니다</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={selected.has(r.id) ? 'sel' : undefined}>
                  <td className="chk">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`${r.modelCode} 선택`}
                    />
                  </td>
                  <td><span className={'eq-badge ' + r.status.toLowerCase()}>{STATUS_LABEL[r.status]}</span></td>
                  <td>{r.categoryName}</td>
                  <td>{r.subcategoryName}{r.energySource ? ` · ${r.energySource}` : ''}</td>
                  <td>{r.seriesName}</td>
                  <td className="mono">{r.modelCode}</td>
                  <td className="mono">{r.equipmentCode ?? '—'}</td>
                  <td className="num">
                    {hp(r.horsepower)}
                    {r.hpSource === 'DERIVED' && (
                      <span className="eq-est" title={HP_ESTIMATED_TITLE} aria-label={HP_ESTIMATED_TITLE}>
                        {' '}
                        (추정)
                      </span>
                    )}
                  </td>
                  <td className="num">{kw(r.coolingW)}</td>
                  <td className="num">{kw(r.heatingW)}</td>
                  <td className="dt">{formatDateTime(r.createdAt)}</td>
                  <td className="dt">{formatDateTime(r.updatedAt)}</td>
                  <td className="dt">{formatDateTime(r.publishedAt)}</td>
                  <td className="eq-actions">
                    <button
                      className="btn sm"
                      onClick={() => setEditing({ mode: 'edit', row: r })}
                      disabled={r.status !== 'DRAFT'}
                      title={r.status === 'DRAFT' ? '스펙 수정' : '게시·단종본은 스펙을 수정할 수 없습니다'}
                      aria-label={`${r.modelCode} 수정`}
                    >
                      수정
                    </button>
                    {ACTIONS[r.status].map((a) => (
                      <button
                        key={a.to}
                        className="btn sm"
                        onClick={() => changeStatus(r, a.to, a.label)}
                        disabled={rowGuard.busy}
                        aria-label={`${r.modelCode} ${a.label}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 표시 설정과 페이지 이동은 테이블 바로 아래에 함께 둔다 — 둘 다 '지금 보는 범위'를 다룬다. */}
      <div className="eq-foot">
        <span className="eq-foot-total">
          총 {filtered.length.toLocaleString()}건 중 {rows.length.toLocaleString()}건 표시
        </span>
        {/* 표시 건수를 바꾸면 보고 있던 페이지 번호가 범위를 벗어날 수 있어 첫 페이지로 되돌린다. */}
        <select className="field sm" aria-label="표시 건수" value={pageSize} onChange={(e) => resetPage(setPageSize)(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}건씩
            </option>
          ))}
        </select>
        <div className="sp" />
        <button className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>← 이전</button>
        <span className="eq-foot-page">{cur + 1} / {pageCount}</span>
        <button className="btn sm" disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>다음 →</button>
      </div>

      {editing && (
        <ProductFormModal
          mode={editing.mode}
          series={series}
          initial={editing.mode === 'edit' ? editing.row : undefined}
          onSave={(draft) => {
            if (editing.mode === 'create') {
              admin.createProduct(draft)
              notify(`${draft.modelCode} 등록 완료 (작성중)`)
            } else {
              admin.updateProduct(editing.row.id, draft)
              notify(`${draft.modelCode} 수정 완료`)
            }
            refresh()
          }}
          onClose={() => setEditing(null)}
        />
      )}


      {uploading && (
        <SpecSheetUploadModal
          series={series}
          existingModelCodes={all.map((r) => r.modelCode)}
          onImport={(seriesCode, rows) => {
            const n = admin.importProducts(seriesCode, rows)
            refresh()
            notify(`${n}건을 작성중(DRAFT)으로 등록했습니다`)
            return n
          }}
          onClose={() => setUploading(false)}
        />
      )}

      <div className={'toast' + (toast ? ' show' : '')} role="status">{toast}</div>
    </AdminShell>
  )
}

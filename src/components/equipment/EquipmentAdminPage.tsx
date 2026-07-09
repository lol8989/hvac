import { useMemo, useState } from 'react'
import type { EquipmentAdminRepository, ProductRow } from '../../application/equipment/adminPorts'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'

// 게시 상태 라벨(무채색 뱃지). 관리 목록은 전 상태를 노출한다.
const STATUS_LABEL: Record<PublishStatus, string> = { DRAFT: '작성중', PUBLISHED: '게시', ARCHIVED: '보관' }
const won = (n: number | null) => (n == null ? '—' : n.toLocaleString('ko-KR') + '원')
const kw = (w: number | null) => (w == null ? '—' : (Math.round(w / 100) / 10).toFixed(1))
const hp = (n: number | null) => (n == null ? '—' : String(n))

const PAGE_SIZE = 12

// 장비마스터 관리 페이지 (목록/필터/상태). 등록·수정·게시는 후속 슬라이스에서 추가.
export default function EquipmentAdminPage({ admin }: { admin: EquipmentAdminRepository }) {
  const all = useMemo(() => admin.listProducts(), [admin])
  const [cat, setCat] = useState<'ALL' | 'INDOOR' | 'OUTDOOR'>('ALL')
  const [status, setStatus] = useState<'ALL' | PublishStatus>('ALL')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const filtered = useMemo<ProductRow[]>(() => {
    const needle = q.trim().toLowerCase()
    return all.filter(
      (r) =>
        (cat === 'ALL' || r.categoryCode === cat) &&
        (status === 'ALL' || r.status === status) &&
        (!needle || r.modelCode.toLowerCase().includes(needle) || (r.equipmentCode ?? '').toLowerCase().includes(needle)),
    )
  }, [all, cat, status, q])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const cur = Math.min(page, pageCount - 1)
  const rows = filtered.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE)
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0) }

  const counts = useMemo(() => {
    const c = { PUBLISHED: 0, DRAFT: 0, ARCHIVED: 0 } as Record<PublishStatus, number>
    for (const r of all) c[r.status]++
    return c
  }, [all])

  return (
    <div className="app">
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
          <nav>
            <a href="./">생성</a>
            <a href="?view=equipment" className="on">장비마스터</a>
          </nav>
        </div>
        <div className="r">
          <span>관리자 / 홍길동</span>
          <a href="./">← 생성으로</a>
        </div>
      </div>

      <div className="sub">
        <div className="title">장비마스터 — 제품 목록</div>
        <span className="b">
          게시 {counts.PUBLISHED} · 작성중 {counts.DRAFT} · 보관 {counts.ARCHIVED}
        </span>
      </div>

      <div className="eq-toolbar">
        <select className="field" aria-label="분류 필터" value={cat} onChange={(e) => resetPage(setCat)(e.target.value as typeof cat)}>
          <option value="ALL">전체 분류</option>
          <option value="INDOOR">실내기</option>
          <option value="OUTDOOR">실외기</option>
        </select>
        <select className="field" aria-label="상태 필터" value={status} onChange={(e) => resetPage(setStatus)(e.target.value as typeof status)}>
          <option value="ALL">전체 상태</option>
          <option value="PUBLISHED">게시</option>
          <option value="DRAFT">작성중</option>
          <option value="ARCHIVED">보관</option>
        </select>
        <input className="field" aria-label="모델명·장비번호 검색" placeholder="모델명·장비번호 검색" value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
        <div className="sp" />
        <span className="eq-count">{filtered.length}건</span>
        <button className="btn sm primary" disabled title="다음 슬라이스에서 활성화">＋ 제품 등록</button>
      </div>

      <div className="eq-table-wrap">
        <table className="eq-table">
          <thead>
            <tr>
              <th>상태</th><th>분류</th><th>계열</th><th>시리즈</th><th>모델명</th><th>장비번호</th>
              <th className="num">HP</th><th className="num">냉방(kW)</th><th className="num">난방(kW)</th><th className="num">단가</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={10} className="eq-empty">조건에 맞는 제품이 없습니다</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td><span className={'eq-badge ' + r.status.toLowerCase()}>{STATUS_LABEL[r.status]}</span></td>
                  <td>{r.categoryName}</td>
                  <td>{r.subcategoryName}{r.energySource ? ` · ${r.energySource}` : ''}</td>
                  <td>{r.seriesName}</td>
                  <td className="mono">{r.modelCode}</td>
                  <td className="mono">{r.equipmentCode ?? '—'}</td>
                  <td className="num">{hp(r.horsepower)}</td>
                  <td className="num">{kw(r.coolingW)}</td>
                  <td className="num">{kw(r.heatingW)}</td>
                  <td className="num">{won(r.priceKrw)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="eq-pager">
        <button className="btn sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>← 이전</button>
        <span>{cur + 1} / {pageCount}</span>
        <button className="btn sm" disabled={cur >= pageCount - 1} onClick={() => setPage(cur + 1)}>다음 →</button>
      </div>
    </div>
  )
}

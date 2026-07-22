// 검색어(입력↔적용 분리) + 페이지네이션 공통 훅 — 관리자 목록/정책 페이지가 공유한다.
//
// 페이지별 필터 술어(predicate)는 각 페이지가 소유한다(분류·계열·상태 등 화면마다 다르다).
// 이 훅은 그 결과를 받아 페이지를 나누고, 필터·검색이 바뀌면 첫 페이지로 되돌린다
// (안 그러면 3페이지를 보다 필터를 좁혀 결과가 1페이지뿐일 때 빈 화면이 남는다).
import { useState } from 'react'

export interface PagedFilter {
  qInput: string // 입력 중인 검색어
  setQInput: (v: string) => void
  q: string // 실제로 목록에 적용된 검색어(검색 버튼·Enter로 확정)
  page: number
  setPage: (v: number) => void
  submitSearch: (e: React.FormEvent) => void // 검색 확정 + 첫 페이지로
  resetQuery: () => void // 검색어 비우기 + 첫 페이지로(필터 초기화의 검색 부분)
  // 필터 setter를 감싸 값 변경 시 첫 페이지로 되돌린다: onChange={resetPage(setCat)}
  resetPage: <T>(setter: (v: T) => void) => (v: T) => void
  // 페이지별로 이미 필터·정렬한 목록을 넘겨 현재 페이지 슬라이스를 얻는다.
  paginate: <T>(items: readonly T[]) => { pageCount: number; cur: number; rows: T[] }
}

export function usePagedFilter(pageSize: number): PagedFilter {
  const [qInput, setQInput] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setQ(qInput)
    setPage(0)
  }
  const resetQuery = () => {
    setQInput('')
    setQ('')
    setPage(0)
  }
  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v)
      setPage(0)
    }
  const paginate = <T,>(items: readonly T[]) => {
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
    const cur = Math.min(page, pageCount - 1)
    const rows = items.slice(cur * pageSize, cur * pageSize + pageSize)
    return { pageCount, cur, rows }
  }

  return { qInput, setQInput, q, page, setPage, submitSearch, resetQuery, resetPage, paginate }
}

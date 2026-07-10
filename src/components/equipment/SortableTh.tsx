// 정렬 가능한 테이블 헤더 셀 — 표시와 접근성만 책임진다(SRP).
// 정렬 규칙은 presentation/equipment/sortRows.ts, 상태는 페이지가 소유한다.

import type { SortKey, SortState } from '../../presentation/equipment/sortRows'

const ARROW = { asc: '▲', desc: '▼' } as const
const DIR_LABEL = { asc: '오름차순', desc: '내림차순' } as const

export interface SortableThProps {
  label: string
  sortKey: SortKey
  sort: SortState
  onSort: (key: SortKey) => void
  numeric?: boolean
}

export default function SortableTh({ label, sortKey, sort, onSort, numeric }: SortableThProps) {
  const active = sort?.key === sortKey ? sort.dir : null

  // 다음에 무엇이 일어나는지 버튼 이름에 담는다 — 스크린리더는 화살표를 읽지 못한다.
  const nextLabel = active === null ? '오름차순 정렬' : active === 'asc' ? '내림차순 정렬' : '정렬 해제'

  return (
    <th
      className={(numeric ? 'num' : '') + ' sortable' + (active ? ' sorted' : '')}
      aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}
      scope="col"
    >
      <button type="button" className="th-sort" onClick={() => onSort(sortKey)} aria-label={`${label} ${nextLabel}`}>
        <span>{label}</span>
        <span className="th-arrow" aria-hidden="true">
          {active ? ARROW[active] : '↕'}
        </span>
      </button>
      {active && <span className="sr-only">{DIR_LABEL[active]} 정렬됨</span>}
    </th>
  )
}

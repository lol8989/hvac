// 상태 칩 — 게시 상태별 건수 요약이자 필터. 요약 pill과 상태 드롭다운이 같은 정보를
// 두 번 말하던 것을 하나로 합쳤다(주인님 지시 2026-07-10: 기능별 재배치).
//
// 건수는 필터와 무관한 전체 기준이다 — 지금 몇 건이 게시 대기 중인지가 관리자의 첫 질문이다.

import type { PublishStatus } from '../../domain/equipment/PublishStatus'

export type StatusFilter = 'ALL' | PublishStatus

interface Chip {
  value: StatusFilter
  label: string
}

const CHIPS: readonly Chip[] = [
  { value: 'ALL', label: '전체' },
  { value: 'PUBLISHED', label: '게시' },
  { value: 'DRAFT', label: '작성중' },
  { value: 'ARCHIVED', label: '단종' },
]

export interface StatusFilterChipsProps {
  counts: Record<PublishStatus, number>
  total: number
  value: StatusFilter
  onChange: (next: StatusFilter) => void
}

export default function StatusFilterChips({ counts, total, value, onChange }: StatusFilterChipsProps) {
  const countOf = (v: StatusFilter) => (v === 'ALL' ? total : counts[v])

  return (
    <div className="eq-chips" role="group" aria-label="상태 필터">
      {CHIPS.map((c) => (
        <button
          key={c.value}
          type="button"
          className={'eq-chip' + (c.value === value ? ' on' : '') + (c.value === 'ALL' ? '' : ' ' + c.value.toLowerCase())}
          aria-pressed={c.value === value}
          aria-label={`상태 필터: ${c.label}`}
          onClick={() => onChange(c.value)}
        >
          <span className="eq-chip-label">{c.label}</span>
          <span className="eq-chip-count">{countOf(c.value).toLocaleString()}</span>
        </button>
      ))}
    </div>
  )
}

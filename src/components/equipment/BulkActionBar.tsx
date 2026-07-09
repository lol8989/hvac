// 선택된 제품에 대한 일괄 게시/보관 바. 항상 노출하되, 선택이 없으면 액션을 비활성화한다
// (기능 발견성 — 선택해야 보이는 바는 처음 쓰는 관리자가 찾지 못한다).
// 전이 불가·게시 전제조건 미달 행은 저장소가 스킵하고 사유를 돌려준다 → 여기서 요약해 보여준다.

import type { BulkStatusResult } from '../../application/equipment/adminPorts'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'
import { useSubmitGuard } from './useSubmitGuard'

export interface BulkActionBarProps {
  selectedCount: number
  filteredCount: number
  allFilteredSelected: boolean
  onSelectAllFiltered: () => void
  onClear: () => void
  onApply: (next: PublishStatus) => BulkStatusResult
  onResult: (result: BulkStatusResult, label: string) => void
}

const ACTIONS: ReadonlyArray<{ to: PublishStatus; label: string; primary?: boolean }> = [
  { to: 'PUBLISHED', label: '일괄 게시', primary: true },
  { to: 'ARCHIVED', label: '일괄 단종' },
]

export default function BulkActionBar({
  selectedCount,
  filteredCount,
  allFilteredSelected,
  onSelectAllFiltered,
  onClear,
  onApply,
  onResult,
}: BulkActionBarProps) {
  const guard = useSubmitGuard()

  const apply = (to: PublishStatus, label: string) =>
    void guard.run(() => {
      onResult(onApply(to), label)
    })

  return (
    <div className="eq-bulk" role="region" aria-label="일괄 작업">
      <span className="eq-bulk-count">
        <b>{selectedCount}</b>건 선택
      </span>
      {!allFilteredSelected && filteredCount > selectedCount && (
        <button className="btn sm" onClick={onSelectAllFiltered}>
          전체 선택
        </button>
      )}
      <button className="btn sm" onClick={onClear} disabled={selectedCount === 0}>선택 해제</button>
      <div className="sp" />
      <span className="eq-bulk-note">전이 불가·요건 미달 행은 자동으로 제외됩니다</span>
      {ACTIONS.map((a) => (
        <button
          key={a.to}
          className={'btn sm' + (a.primary ? ' primary' : '')}
          onClick={() => apply(a.to, a.label)}
          disabled={guard.busy || selectedCount === 0}
          aria-label={a.label}
        >
          {guard.busy ? '처리 중…' : a.label}
        </button>
      ))}
    </div>
  )
}

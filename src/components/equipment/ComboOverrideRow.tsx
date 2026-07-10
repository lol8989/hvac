// 실외기 한 대의 조합비 override 행. 편집 중에만 입력창을 연다.
//
// 정책은 스펙이 아니므로 게시본(PUBLISHED)도 조정할 수 있다 — 상태에 따라 잠그지 않는다.

import { useState } from 'react'
import type { ProductRow } from '../../application/equipment/adminPorts'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'
import { ComboRange } from '../../domain/shared/ComboRange'
import { parsePercent, toPercentInput, toPercentLabel } from '../../presentation/equipment/comboFormat'

const STATUS_LABEL: Record<PublishStatus, string> = { DRAFT: '작성중', PUBLISHED: '게시', ARCHIVED: '단종' }

export interface ComboOverrideRowProps {
  row: ProductRow
  range: ComboRange // 현재 적용 중인 범위(override 또는 전역 기본)
  overridden: boolean
  onSave: (modelCode: string, range: ComboRange | null) => void
}

export default function ComboOverrideRow({ row, range, overridden, onSave }: ComboOverrideRowProps) {
  const [editing, setEditing] = useState(false)
  const [min, setMin] = useState(() => toPercentInput(range.min))
  const [max, setMax] = useState(() => toPercentInput(range.max))
  const [error, setError] = useState('')

  const open = () => {
    setMin(toPercentInput(range.min))
    setMax(toPercentInput(range.max))
    setError('')
    setEditing(true)
  }

  const commit = () => {
    const lo = parsePercent(min)
    const hi = parsePercent(max)
    if (lo === null || hi === null) {
      setError('숫자를 입력하세요')
      return
    }
    try {
      onSave(row.modelCode, new ComboRange(lo, hi))
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '값이 올바르지 않습니다')
    }
  }

  return (
    <tr className={overridden ? 'combo-overridden' : undefined}>
      <td className="mono">{row.modelCode}</td>
      <td>{row.seriesName}</td>
      <td>
        <span className={'eq-badge ' + row.status.toLowerCase()}>{STATUS_LABEL[row.status]}</span>
      </td>

      {editing ? (
        <>
          <td className="num">
            <input className="field sm combo-cell" inputMode="decimal" aria-label={`${row.modelCode} 하한(%)`} value={min} onChange={(e) => setMin(e.target.value)} />
          </td>
          <td className="num">
            <input className="field sm combo-cell" inputMode="decimal" aria-label={`${row.modelCode} 상한(%)`} value={max} onChange={(e) => setMax(e.target.value)} />
          </td>
          <td>{error ? <span className="combo-err-inline">{error}</span> : '편집 중'}</td>
          <td>
            <div className="eq-actions">
              <button className="btn sm primary" onClick={commit} aria-label={`${row.modelCode} 저장`}>
                저장
              </button>
              <button className="btn sm" onClick={() => setEditing(false)} aria-label={`${row.modelCode} 취소`}>
                취소
              </button>
            </div>
          </td>
        </>
      ) : (
        <>
          <td className="num">{toPercentLabel(range.min)}</td>
          <td className="num">{toPercentLabel(range.max)}</td>
          <td>{overridden ? <span className="combo-tag">모델별 예외</span> : <span className="combo-muted">전역 기본</span>}</td>
          <td>
            <div className="eq-actions">
              <button className="btn sm" onClick={open} aria-label={`${row.modelCode} 조합비 편집`}>
                편집
              </button>
              <button className="btn sm" onClick={() => onSave(row.modelCode, null)} disabled={!overridden} aria-label={`${row.modelCode} 기본값으로`}>
                기본값으로
              </button>
            </div>
          </td>
        </>
      )}
    </tr>
  )
}

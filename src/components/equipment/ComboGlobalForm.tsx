// 전역 조합비 기본값 입력. override가 없는 실외기 전부가 이 값을 따른다.

// 저장 후 정책이 갱신되면 부모가 key를 바꿔 이 폼을 새로 만든다(입력 상태를 effect로 되맞추지 않는다).
import { useState } from 'react'
import { ComboRange } from '../../domain/shared/ComboRange'
import { parsePercent, toPercentInput } from '../../presentation/equipment/comboFormat'

export interface ComboGlobalFormProps {
  global: ComboRange
  busy: boolean
  onSave: (range: ComboRange) => void
}

export default function ComboGlobalForm({ global, busy, onSave }: ComboGlobalFormProps) {
  const [min, setMin] = useState(() => toPercentInput(global.min))
  const [max, setMax] = useState(() => toPercentInput(global.max))
  const [error, setError] = useState('')

  const dirty = min !== toPercentInput(global.min) || max !== toPercentInput(global.max)

  const submit = () => {
    const lo = parsePercent(min)
    const hi = parsePercent(max)
    if (lo === null || hi === null) {
      setError('숫자를 입력하세요 (예: 50, 103)')
      return
    }
    try {
      const range = new ComboRange(lo, hi) // 불변식(0 < min < max)은 값객체가 지킨다
      setError('')
      onSave(range)
    } catch (e) {
      setError(e instanceof Error ? e.message : '허용범위가 올바르지 않습니다')
    }
  }

  return (
    <section className="combo-global" aria-label="전역 기본 조합비">
      <h2 className="combo-global-text">전역 기본</h2>

      <label className="combo-field">
        <span>하한</span>
        <input className="field" inputMode="decimal" aria-label="전역 하한(%)" value={min} onChange={(e) => setMin(e.target.value)} />
        <em>%</em>
      </label>
      <span className="combo-tilde" aria-hidden="true">
        ~
      </span>
      <label className="combo-field">
        <span>상한</span>
        <input className="field" inputMode="decimal" aria-label="전역 상한(%)" value={max} onChange={(e) => setMax(e.target.value)} />
        <em>%</em>
      </label>

      <button className="btn primary" onClick={submit} disabled={busy || !dirty}>
        {busy ? '저장 중…' : '전역 기본 저장'}
      </button>

      {error && (
        <p className="combo-err" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

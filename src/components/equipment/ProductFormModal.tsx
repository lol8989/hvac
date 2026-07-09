// 제품 등록/수정 폼 모달. 저장은 더블클릭 가드(useSubmitGuard)로 1회만 실행된다.
// 유효성은 도메인(assertValidDraft)이 최종 강제하고, 이 폼은 그 예외 메시지를 사용자에게 보여준다.

import { useState } from 'react'
import type { SeriesOption, ProductRow } from '../../application/equipment/adminPorts'
import type { ProductDraft } from '../../domain/equipment/ProductDraft'
import { useSubmitGuard } from './useSubmitGuard'

// 빈 입력은 null(미입력)로, 그 외에는 수치로. 숫자가 아니면 NaN → 도메인이 거부한다.
const toNum = (s: string): number | null => (s.trim() === '' ? null : Number(s))
const toStr = (n: number | null): string => (n == null ? '' : String(n))

export interface ProductFormModalProps {
  mode: 'create' | 'edit'
  series: SeriesOption[]
  initial?: ProductRow // edit 모드에서 채워 넣을 현재 값
  onSave: (draft: ProductDraft) => void // 도메인 예외를 던질 수 있다
  onClose: () => void
}

export default function ProductFormModal({ mode, series, initial, onSave, onClose }: ProductFormModalProps) {
  const [seriesCode, setSeriesCode] = useState(initial?.seriesCode ?? series[0]?.code ?? '')
  const [modelCode, setModelCode] = useState(initial?.modelCode ?? '')
  const [equipmentCode, setEquipmentCode] = useState(initial?.equipmentCode ?? '')
  const [horsepower, setHorsepower] = useState(toStr(initial?.horsepower ?? null))
  const [coolingW, setCoolingW] = useState(toStr(initial?.coolingW ?? null))
  const [heatingW, setHeatingW] = useState(toStr(initial?.heatingW ?? null))
  const [maxConnections, setMaxConnections] = useState(toStr(initial?.maxConnections ?? null))
  const [error, setError] = useState('')
  const { busy, run } = useSubmitGuard()

  const isOutdoor = series.find((s) => s.code === seriesCode)?.categoryCode === 'OUTDOOR'
  const title = mode === 'create' ? '제품 등록' : `제품 수정 — ${initial?.modelCode}`

  const submit = () =>
    void run(() => {
      setError('')
      try {
        onSave({
          seriesCode,
          modelCode,
          equipmentCode: equipmentCode.trim() === '' ? null : equipmentCode,
          // 실내기로 시리즈를 바꾼 뒤 저장하면 숨겨진 실외기 필드는 버린다(유령 값 방지).
          horsepower: isOutdoor ? toNum(horsepower) : null,
          coolingW: toNum(coolingW),
          heatingW: toNum(heatingW),
          maxConnections: isOutdoor ? toNum(maxConnections) : null,
        })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했습니다')
      }
    })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal eq-form" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="m-h">
          <span className="mt">{title}</span>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="m-note">신규 제품은 작성중(DRAFT)으로 등록됩니다. 게시해야 생성·검도에 노출됩니다.</div>

        <div className="eq-form-body">
          <label className="eq-f">
            <span>시리즈 *</span>
            <select className="field" value={seriesCode} onChange={(e) => setSeriesCode(e.target.value)} aria-label="시리즈">
              {series.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.categoryName} · {s.subcategoryName} — {s.nameKo}
                </option>
              ))}
            </select>
          </label>

          <label className="eq-f">
            <span>모델명 *</span>
            <input className="field" value={modelCode} onChange={(e) => setModelCode(e.target.value)} placeholder="RNW0401C2S" aria-label="모델명" />
          </label>

          <label className="eq-f">
            <span>장비번호</span>
            <input className="field" value={equipmentCode} onChange={(e) => setEquipmentCode(e.target.value)} placeholder="40C" aria-label="장비번호" />
          </label>

          <label className="eq-f">
            <span>냉방 용량(W)</span>
            <input className="field" value={coolingW} onChange={(e) => setCoolingW(e.target.value)} inputMode="numeric" placeholder="4000" aria-label="냉방 용량(W)" />
          </label>

          <label className="eq-f">
            <span>난방 용량(W)</span>
            <input className="field" value={heatingW} onChange={(e) => setHeatingW(e.target.value)} inputMode="numeric" placeholder="4500 (냉방전용은 비움)" aria-label="난방 용량(W)" />
          </label>

          {isOutdoor && (
            <>
              <label className="eq-f">
                <span>마력(HP)</span>
                <input className="field" value={horsepower} onChange={(e) => setHorsepower(e.target.value)} inputMode="numeric" placeholder="12" aria-label="마력(HP)" />
              </label>
              <label className="eq-f">
                <span>최대 연결 실내기 수</span>
                <input className="field" value={maxConnections} onChange={(e) => setMaxConnections(e.target.value)} inputMode="numeric" placeholder="20" aria-label="최대 연결 실내기 수" />
              </label>
            </>
          )}

          {error && <div className="eq-form-err" role="alert">{error}</div>}
        </div>

        <div className="eq-form-foot">
          <button className="btn" onClick={onClose} disabled={busy}>취소</button>
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

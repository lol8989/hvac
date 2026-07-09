// 단가 변경 모달. 저장 시 기존 현행가는 마감되고 새 행이 현행가가 된다(이력 보존).
// 게시본 잠금은 스펙에만 적용되므로 PUBLISHED 제품도 단가는 변경할 수 있다.

import { useState } from 'react'
import type { ProductRow } from '../../application/equipment/adminPorts'
import type { PriceInput } from '../../domain/equipment/ProductDraft'
import { useSubmitGuard } from './useSubmitGuard'

const toIntOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s))

export interface PriceModalProps {
  product: ProductRow
  today: string // yyyy-mm-dd (주입 — 테스트 결정성)
  onSave: (price: PriceInput) => void // 도메인 예외를 던질 수 있다
  onClose: () => void
}

export default function PriceModal({ product, today, onSave, onClose }: PriceModalProps) {
  const [priceKrw, setPriceKrw] = useState(product.priceKrw == null ? '' : String(product.priceKrw))
  const [priceWithVatKrw, setPriceWithVatKrw] = useState('')
  const [effectiveStartDate, setEffectiveStartDate] = useState(today)
  const [error, setError] = useState('')
  const { busy, run } = useSubmitGuard()

  const submit = () =>
    void run(() => {
      setError('')
      try {
        onSave({
          priceKrw: Number(priceKrw),
          priceWithVatKrw: toIntOrNull(priceWithVatKrw),
          effectiveStartDate,
        })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장에 실패했습니다')
      }
    })

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal eq-form" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="단가 변경">
        <div className="m-h">
          <span className="mt">단가 변경 — {product.modelCode}</span>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="m-note">기존 현행가는 적용일자로 마감되고 새 단가가 현행가가 됩니다(이력 보존).</div>

        <div className="eq-form-body">
          <label className="eq-f">
            <span>소비자가(VAT별도) *</span>
            <input className="field" value={priceKrw} onChange={(e) => setPriceKrw(e.target.value)} inputMode="numeric" placeholder="4120000" aria-label="소비자가(VAT별도)" />
          </label>
          <label className="eq-f">
            <span>VAT포함가</span>
            <input className="field" value={priceWithVatKrw} onChange={(e) => setPriceWithVatKrw(e.target.value)} inputMode="numeric" placeholder="미상이면 비움" aria-label="VAT포함가" />
          </label>
          <label className="eq-f">
            <span>적용일 *</span>
            <input className="field" type="date" value={effectiveStartDate} onChange={(e) => setEffectiveStartDate(e.target.value)} aria-label="적용일" />
          </label>

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

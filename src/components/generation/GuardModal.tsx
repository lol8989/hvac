// 스텝 가드 팝업 — 도메인(StepGuard)이 낸 판정을 사용자에게 보여준다.
//
//  · BLOCK   — 진행 불가. '확인' 하나. 사유와 해결법을 함께 보여준다(무반응 금지).
//  · CONFIRM — 진행 가능하나 확인 필요. '취소' / '계속 진행'.
//
// CTA 버튼은 항상 활성이고, 클릭하면 이 팝업이 이유를 말한다(주인님 확정 2026-07-10).
import { useEffect } from 'react'
import type { GuardVerdict } from '../../domain/generation/StepGuard'

interface GuardModalProps {
  verdict: Extract<GuardVerdict, { kind: 'BLOCK' } | { kind: 'CONFIRM' }>
  confirmLabel?: string // CONFIRM일 때 진행 버튼 라벨
  confirms?: Extract<GuardVerdict, { kind: 'CONFIRM' }>[] // 2건 이상이면 목록으로 병합 안내
  onProceed: () => void // CONFIRM에서 '계속 진행'
  onClose: () => void
}

export default function GuardModal({ verdict, confirmLabel = '계속 진행', confirms, onProceed, onClose }: GuardModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const blocked = verdict.kind === 'BLOCK'
  const sub = blocked ? verdict.remedy : verdict.detail
  // 확인 항목이 여러 건이면 첫 개만 보여주지 않고 전부 목록으로 안내한다.
  const merged = confirms && confirms.length >= 2
  const title = merged ? `확인이 필요한 항목 ${confirms.length}건` : verdict.title

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).classList.contains('overlay')) onClose()
      }}
    >
      <div className="modal confirm" role="alertdialog" aria-label={title}>
        <div className="m-h">
          <span className="mt">{title}</span>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="confirm-body">
          {merged ? (
            <ul className="guard-list">
              {confirms.map((c, i) => (
                <li key={c.code + i} className="guard-item">
                  <p className="guard-item-title">{c.title}</p>
                  <p className="guard-reason">{c.reason}</p>
                  <p className="guard-remedy">{c.detail}</p>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="guard-reason">{verdict.reason}</p>
              <p className="guard-remedy">{blocked ? '→ ' : ''}{sub}</p>
            </>
          )}
        </div>
        <div className="m-f">
          <div className="sp" />
          {blocked ? (
            <button className="btn primary" onClick={onClose} autoFocus>확인</button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>취소</button>
              <button className="btn primary" onClick={onProceed}>{confirmLabel}</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

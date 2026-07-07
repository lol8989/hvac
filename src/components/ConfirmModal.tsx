// 확인 팝업(딤 배경) — 되돌리기 어려운 일괄 동작 전 주의를 준다.
// 확인 = onConfirm 실행 / 취소·Esc·바깥 클릭 = onCancel(아무 이벤트 없이 닫힘).
import { useEffect } from 'react'

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({ title, message, confirmLabel = '확인', onConfirm, onCancel }: ConfirmModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).classList.contains('overlay')) onCancel()
      }}
    >
      <div className="modal confirm">
        <div className="m-h">
          <span className="mt">{title}</span>
          <button className="x" onClick={onCancel} aria-label="닫기">×</button>
        </div>
        <div className="confirm-body">{message}</div>
        <div className="m-f">
          <div className="sp" />
          <button className="btn" onClick={onCancel}>취소</button>
          <button className="btn primary" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'

interface StepOverlayProps {
  icon: string
  title: string
  desc: string
  meta?: string // 부가 안내(허용 포맷/용량 등)
  children?: ReactNode // 액션 버튼 영역
}

// 뷰어가 아직/더는 필요 없는 단계(업로드·산출물)용 중앙 카드 오버레이(무채색).
export default function StepOverlay({ icon, title, desc, meta, children }: StepOverlayProps) {
  return (
    <div className="stage stage-overlay">
      <div className="stepcard">
        <div className="stepcard-icon">{icon}</div>
        <div className="stepcard-title">{title}</div>
        <div className="stepcard-desc">{desc}</div>
        {meta && <div className="stepcard-meta">{meta}</div>}
        {children && <div className="stepcard-actions">{children}</div>}
      </div>
    </div>
  )
}

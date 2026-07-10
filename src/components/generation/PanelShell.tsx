// 우측 컨텍스트 패널의 껍데기 — 접기/펼치기 + 폭 조절.
// 내용은 단계가 정한다(검출 결과 / 모델 선택 / 실외기 배치 / 산출물).
// 접힌 상태는 얇은 세로 레일이라 도면이 넓어진다(CLAUDE.md 사이드 패널 규칙).

import { useRef } from 'react'
import type { ReactNode } from 'react'

const MIN_W = 260
const MAX_W = 560

interface PanelShellProps {
  title: string
  open: boolean
  width: number
  onToggle: () => void
  onWidthChange: (w: number) => void
  children: ReactNode
  footer?: ReactNode
}

export default function PanelShell({ title, open, width, onToggle, onWidthChange, children, footer }: PanelShellProps) {
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startX: e.clientX, startW: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return
      // 패널은 우측 고정 → 핸들을 왼쪽으로 끌면 폭이 커진다.
      onWidthChange(Math.max(MIN_W, Math.min(MAX_W, drag.current.startW + (drag.current.startX - ev.clientX))))
    }
    const onUp = () => {
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (!open) {
    return (
      <aside className="rpanel collapsed">
        <button className="rp-expand" onClick={onToggle} title="패널 펼치기" aria-label="패널 펼치기">◀</button>
        <span className="rp-vlabel">{title}</span>
      </aside>
    )
  }

  return (
    <aside className="rpanel" style={{ width }}>
      <div className="rp-resizer" onPointerDown={onResizeDown} title="드래그하여 폭 조절" />
      <div className="rp-h">
        <span>{title}</span>
        <button className="x" onClick={onToggle} title="패널 접기" aria-label="패널 접기">▶</button>
      </div>
      <div className="rp-body">{children}</div>
      {footer && <div className="rp-foot">{footer}</div>}
    </aside>
  )
}

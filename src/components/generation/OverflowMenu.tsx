// 워크바 우측 '⋯' 메뉴 — 단계와 무관한 보조 동작(화면 캡처 등)을 담는다.
//
// 예전 툴바에는 '⭳ 결과 다운로드'가 검출 단계부터 상시 노출돼 파이프라인을 우회할 수 있었다.
// 산출물 다운로드는 산출물 단계의 일이다. 여기에는 언제 눌러도 안전한 것만 둔다.

import { useEffect, useRef, useState } from 'react'

export interface OverflowItem {
  label: string
  onClick: () => void
  disabled?: boolean
}

export default function OverflowMenu({ items }: { items: OverflowItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="ovf" ref={ref}>
      <button className="btn sm" onClick={() => setOpen((o) => !o)} aria-label="더 보기" aria-expanded={open}>⋯</button>
      {open && (
        <div className="ovf-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick() }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

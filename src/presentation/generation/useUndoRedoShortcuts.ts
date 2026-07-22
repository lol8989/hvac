// Ctrl+Z / Ctrl+Shift+Z(또는 Ctrl+Y) 전역 단축키 — 입력 필드에 포커스가 있으면 무시.
// 리스너는 1회만 등록하고(리렌더마다 재바인딩하지 않는다), 최신 핸들러는 ref로 읽는다
// (예전엔 deps 없는 useEffect가 매 렌더 재바인딩했다 — 리렌더 캐스케이드 경고의 원인).
import { useEffect, useRef } from 'react'

const typing = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

export function useUndoRedoShortcuts(onUndo: () => void, onRedo: () => void): void {
  const handlers = useRef({ onUndo, onRedo })
  handlers.current = { onUndo, onRedo } // 매 렌더 최신 핸들러로 갱신(재바인딩 없이 최신을 읽는다)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || typing(e.target)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        handlers.current.onUndo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        handlers.current.onRedo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

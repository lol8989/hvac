// 짧은 토스트 알림 훅 — 관리자 페이지 공통. 연속 알림 시 이전 타이머를 지워
// 뒤 메시지가 조기에 사라지지 않게 한다(예전 목록·정책 페이지의 잠재 버그를 해소).
import { useCallback, useEffect, useRef, useState } from 'react'

export function useToast(durationMs = 3000): { toast: string; notify: (msg: string) => void } {
  const [toast, setToast] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = useCallback(
    (msg: string) => {
      setToast(msg)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setToast(''), durationMs)
    },
    [durationMs],
  )

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return { toast, notify }
}

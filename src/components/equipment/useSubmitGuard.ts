// 제출 재진입 방지(더블클릭 가드).
// 버튼 disabled만으로는 부족하다 — 연타는 React 리렌더 전에 도착하므로 동기 ref 잠금으로 먼저 막고,
// busy 상태는 버튼 비활성/라벨 표시에 쓴다. 저장·수정·게시 등 모든 쓰기 액션에 공통 적용.

import { useCallback, useEffect, useRef, useState } from 'react'

export interface SubmitGuard {
  busy: boolean
  // 실행 중이면 재호출을 무시한다. 반환값: 실제로 실행했으면 true.
  run: (action: () => void | Promise<void>) => Promise<boolean>
}

export function useSubmitGuard(): SubmitGuard {
  const [busy, setBusy] = useState(false)
  const locked = useRef(false) // 동기 잠금 — 같은 tick의 두 번째 클릭을 즉시 차단
  const mounted = useRef(true)

  // 성공 시 모달이 닫히며 언마운트되므로, 그 뒤 setBusy를 호출하지 않는다.
  // 마운트 시 반드시 true로 되돌린다 — StrictMode(dev)는 mount→unmount→remount를 수행하는데,
  // ref는 그 사이 유지되므로 초기값에만 의존하면 false로 굳어 busy가 영구 true가 된다.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async (action: () => void | Promise<void>): Promise<boolean> => {
    if (locked.current) return false
    locked.current = true
    setBusy(true)
    try {
      await action()
      return true
    } finally {
      locked.current = false
      if (mounted.current) setBusy(false)
    }
  }, [])

  return { busy, run }
}

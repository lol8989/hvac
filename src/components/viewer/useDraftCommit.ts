// 드래그 중 로컬 미리보기(draft) + 커밋 패턴 — 뷰어 공용.
//
// 실내기·실외기·실(존) 형상은 App이 소유한다(controlled). 60fps 드래그마다 App을 리렌더하면
// 무겁고 undo 히스토리가 더러워지므로, 드래그 중에는 뷰어가 draft로 그리고 마우스를 뗄 때 한 번만 커밋한다.
//
// draft가 두 얼굴을 갖는 이유:
//  · value(state) — 렌더에 쓴다(미리보기 도형).
//  · ref          — window에 1회 등록한 mousemove/up 리스너가 stale closure 없이 동기로 읽는다.
// 둘을 손으로 맞추던 코드가 세 곳에 복붙돼 있었다 → 이 훅으로 한 번에 갱신(set)·해제(clear)한다.
import { useCallback, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

export interface Draft<T> {
  value: T | null // 렌더용 미리보기 값
  ref: MutableRefObject<T | null> // 전역 리스너에서 동기 읽기용(항상 value와 같은 값)
  set: (v: T | null) => void // ref·state를 함께 갱신
  clear: () => void // 커밋·취소 시 둘 다 비운다
}

export function useDraftCommit<T>(): Draft<T> {
  const [value, setValue] = useState<T | null>(null)
  const ref = useRef<T | null>(null)
  const set = useCallback((v: T | null) => {
    ref.current = v
    setValue(v)
  }, [])
  const clear = useCallback(() => {
    ref.current = null
    setValue(null)
  }, [])
  return { value, ref, set, clear }
}

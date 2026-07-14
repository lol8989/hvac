// 되돌리기/다시하기 (presentation 훅).
//
// 편집 상태를 하나의 값(World)으로 묶어 스냅샷을 쌓는다. 스냅샷이 원자적이어야
// "실을 자른 것"이 한 번의 Ctrl+Z로 통째로 돌아간다(실·형상·배치가 따로 놀지 않는다).
//
// commit  — 사용자의 편집. 히스토리를 쌓는다.
// replace — 파생 동기화(플랜 재계산 등). 히스토리를 쌓지 않는다.
//           안 그러면 Ctrl+Z가 사용자가 한 적 없는 일을 되돌린다.

import { useCallback, useState } from 'react'

export const HISTORY_LIMIT = 50

interface Entry<T> {
  world: T
  label: string // 그 상태를 만든 편집의 이름("실 자르기")
}

interface History<T> {
  past: Entry<T>[]
  present: Entry<T>
  future: Entry<T>[]
}

export interface Undoable<T> {
  present: T
  commit: (fn: (w: T) => T, label: string) => void
  replace: (fn: (w: T) => T) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null // 되돌리면 취소되는 편집의 이름
  redoLabel: string | null
}

export function useUndoable<T>(initial: T | (() => T), initialLabel = ''): Undoable<T> {
  const [h, setH] = useState<History<T>>(() => ({
    past: [],
    present: { world: typeof initial === 'function' ? (initial as () => T)() : initial, label: initialLabel },
    future: [],
  }))

  const commit = useCallback((fn: (w: T) => T, label: string) => {
    setH((cur) => {
      const next = fn(cur.present.world)
      if (next === cur.present.world) return cur // 아무것도 안 바뀌었다 — 히스토리를 더럽히지 않는다
      const past = [...cur.past, cur.present].slice(-HISTORY_LIMIT)
      return { past, present: { world: next, label }, future: [] }
    })
  }, [])

  const replace = useCallback((fn: (w: T) => T) => {
    setH((cur) => {
      const next = fn(cur.present.world)
      if (next === cur.present.world) return cur
      return { ...cur, present: { world: next, label: cur.present.label } }
    })
  }, [])

  const undo = useCallback(() => {
    setH((cur) => {
      if (cur.past.length === 0) return cur
      const prev = cur.past[cur.past.length - 1]
      return { past: cur.past.slice(0, -1), present: prev, future: [cur.present, ...cur.future] }
    })
  }, [])

  const redo = useCallback(() => {
    setH((cur) => {
      if (cur.future.length === 0) return cur
      const [next, ...rest] = cur.future
      return { past: [...cur.past, cur.present], present: next, future: rest }
    })
  }, [])

  return {
    present: h.present.world,
    commit,
    replace,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    undoLabel: h.past.length > 0 ? h.present.label : null,
    redoLabel: h.future.length > 0 ? h.future[0].label : null,
  }
}

// 편집 상태(World) 되돌리기 토대 + 부분 편집 헬퍼.
//
// 생성 파이프라인의 편집 상태를 World 한 덩어리로 묶어 원자적 스냅샷을 쌓는다(§5.7).
// 사용자의 편집 1회 = 커밋 1회 = Ctrl+Z 1회. 파생 동기화는 replace(히스토리 미기록).
//
// App.tsx가 useUndoable·edit·editPlacements·editOutdoorPositions를 직접 들고 있던 것을 한 곳으로 모은다.
// 이 훅은 '어떻게 되돌리는가'(메커니즘)만 안다 — 무엇을 편집하는가는 호출부(커맨드 훅)가 정한다.
import { useUndoable } from './useUndoable'
import type { World } from './world'
import type { Placement } from '../../domain/generation/Placement'

type Up<T> = T | ((prev: T) => T)
const resolve = <T,>(v: Up<T>, prev: T): T => (typeof v === 'function' ? (v as (p: T) => T)(prev) : v)

type PlacementMap = Record<string, Placement>
type OutdoorPositions = Record<string, { x: number; y: number }>

export interface UndoableWorld {
  world: World
  // commit — 사용자의 편집(히스토리 1건). replace — 파생 동기화(히스토리 미기록).
  edit: (fn: (w: World) => World, label: string) => void
  replace: (fn: (w: World) => World) => void
  // 부분 편집 헬퍼 — 한 사용자 행동 = 한 커밋(= Ctrl+Z 한 번).
  editPlacements: (label: string, v: Up<PlacementMap>) => void
  editOutdoorPositions: (label: string, v: Up<OutdoorPositions>) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}

export function useUndoableWorld(initial: () => World): UndoableWorld {
  const undoable = useUndoable<World>(initial, '')
  const world = undoable.present
  const edit = undoable.commit

  const editPlacements = (label: string, v: Up<PlacementMap>) =>
    edit((w) => ({ ...w, placements: resolve(v, w.placements) }), label)
  const editOutdoorPositions = (label: string, v: Up<OutdoorPositions>) =>
    edit((w) => ({ ...w, outdoorPositions: resolve(v, w.outdoorPositions) }), label)

  return {
    world,
    edit,
    replace: undoable.replace,
    editPlacements,
    editOutdoorPositions,
    undo: undoable.undo,
    redo: undoable.redo,
    canUndo: undoable.canUndo,
    canRedo: undoable.canRedo,
    undoLabel: undoable.undoLabel,
    redoLabel: undoable.redoLabel,
  }
}

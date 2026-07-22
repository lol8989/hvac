/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoableWorld } from './useUndoableWorld'
import type { World } from './world'
import { bootstrapPlan } from './planAdapter'
import { Placement } from '../../domain/generation/Placement'
import { DEFAULT_FACILITY } from '../../data'

// 최소 초기 World — 되돌리기 토대만 검증하므로 실·형상은 비운다.
const initialWorld = (): World => ({
  plan: bootstrapPlan(),
  rooms: {},
  geom: {},
  placements: {},
  outdoorPositions: {},
  facility: DEFAULT_FACILITY,
  ceilingHeights: {},
})

const oneUnit = () => Placement.ai('AC_001', { modelCode: 'RNW0601A2U', quantity: 1 }, [{ x: 1, y: 1, rot: 0 }])

describe('useUndoableWorld', () => {
  it('editPlacements는 커밋 1건을 쌓고 되돌릴 수 있다', () => {
    const { result } = renderHook(() => useUndoableWorld(initialWorld))
    expect(result.current.canUndo).toBe(false)

    act(() => result.current.editPlacements('실내기 추가', { AC_001: oneUnit() }))
    expect(Object.keys(result.current.world.placements)).toEqual(['AC_001'])
    expect(result.current.canUndo).toBe(true)
    expect(result.current.undoLabel).toBe('실내기 추가')

    act(() => result.current.undo())
    expect(result.current.world.placements).toEqual({})
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(Object.keys(result.current.world.placements)).toEqual(['AC_001'])
  })

  it('editOutdoorPositions는 함수형 업데이트(prev)를 받는다', () => {
    const { result } = renderHook(() => useUndoableWorld(initialWorld))
    act(() => result.current.editOutdoorPositions('실외기 이동', { ODU1: { x: 5, y: 5 } }))
    act(() => result.current.editOutdoorPositions('실외기 이동2', (prev) => ({ ...prev, ODU2: { x: 9, y: 9 } })))
    expect(result.current.world.outdoorPositions).toEqual({ ODU1: { x: 5, y: 5 }, ODU2: { x: 9, y: 9 } })
    expect(result.current.canUndo).toBe(true)
  })

  it('replace는 파생 동기화라 히스토리를 쌓지 않는다(Ctrl+Z가 사용자 편집만 되돌린다)', () => {
    const { result } = renderHook(() => useUndoableWorld(initialWorld))
    act(() => result.current.editPlacements('실내기 추가', { AC_001: oneUnit() }))
    // 파생 동기화(플랜 재계산 흉내) — replace로 갈아끼운다.
    const newPlan = bootstrapPlan()
    act(() => result.current.replace((w) => ({ ...w, plan: newPlan })))
    expect(result.current.world.plan).toBe(newPlan)

    // 되돌리면 '실내기 추가'가 취소돼야 한다(파생 replace가 아니라).
    expect(result.current.undoLabel).toBe('실내기 추가')
    act(() => result.current.undo())
    expect(result.current.world.placements).toEqual({})
  })
})

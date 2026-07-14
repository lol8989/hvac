/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUndoable, HISTORY_LIMIT } from './useUndoable'

const setup = () => renderHook(() => useUndoable({ n: 0 }, 'init'))

describe('useUndoable — 편집 히스토리', () => {
  it('처음에는 되돌릴 것도 다시 할 것도 없다', () => {
    const { result } = setup()
    expect(result.current.present).toEqual({ n: 0 })
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
  })

  it('commit은 히스토리를 쌓고, undo가 직전 상태로 되돌린다', () => {
    const { result } = setup()
    act(() => result.current.commit((w) => ({ n: w.n + 1 }), '더하기'))
    act(() => result.current.commit((w) => ({ n: w.n + 1 }), '더하기'))
    expect(result.current.present).toEqual({ n: 2 })

    act(() => result.current.undo())
    expect(result.current.present).toEqual({ n: 1 })
    act(() => result.current.undo())
    expect(result.current.present).toEqual({ n: 0 })
    expect(result.current.canUndo).toBe(false)
  })

  it('redo가 되돌린 것을 다시 적용한다', () => {
    const { result } = setup()
    act(() => result.current.commit(() => ({ n: 7 }), '설정'))
    act(() => result.current.undo())
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.redo())
    expect(result.current.present).toEqual({ n: 7 })
    expect(result.current.canRedo).toBe(false)
  })

  it('되돌린 뒤 새로 편집하면 redo 가지는 버려진다', () => {
    const { result } = setup()
    act(() => result.current.commit(() => ({ n: 1 }), 'a'))
    act(() => result.current.undo())
    act(() => result.current.commit(() => ({ n: 9 }), 'b'))
    expect(result.current.canRedo).toBe(false)
    expect(result.current.present).toEqual({ n: 9 })
  })

  // 파생 동기화(플랜 재계산 등)가 히스토리를 쌓으면 Ctrl+Z가
  // 사용자가 한 적 없는 일을 되돌린다 — 그래서 replace 경로가 따로 있다.
  it('replace는 히스토리를 남기지 않는다', () => {
    const { result } = setup()
    act(() => result.current.commit(() => ({ n: 1 }), '편집'))
    act(() => result.current.replace(() => ({ n: 100 })))
    expect(result.current.present).toEqual({ n: 100 })

    act(() => result.current.undo())
    expect(result.current.present).toEqual({ n: 0 }) // 편집 이전으로 한 번에 돌아간다
  })

  it('되돌릴 편집의 이름을 알려준다(버튼 툴팁)', () => {
    const { result } = setup()
    act(() => result.current.commit(() => ({ n: 1 }), '실 자르기'))
    expect(result.current.undoLabel).toBe('실 자르기')
  })

  it(`히스토리는 ${HISTORY_LIMIT}단계까지만 쌓인다(오래된 것부터 버린다)`, () => {
    const { result } = setup()
    act(() => {
      for (let i = 1; i <= HISTORY_LIMIT + 10; i++) result.current.commit(() => ({ n: i }), `${i}`)
    })
    let steps = 0
    while (result.current.canUndo) {
      act(() => result.current.undo())
      steps++
      if (steps > HISTORY_LIMIT + 20) break
    }
    expect(steps).toBe(HISTORY_LIMIT)
  })

  it('commit이 같은 값을 돌려주면 히스토리를 쌓지 않는다(빈 편집)', () => {
    const { result } = setup()
    act(() => result.current.commit((w) => w, '아무것도 안 함'))
    expect(result.current.canUndo).toBe(false)
  })
})

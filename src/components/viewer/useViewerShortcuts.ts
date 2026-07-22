// 뷰어 키보드 단축키 — 모드 전환·회전·삭제·취소·화면맞춤을 window 리스너 1개로 처리.
//
// 리스너는 1회만 등록하고 최신 상태/콜백은 ref(st·cbRef·enter*Ref)로 읽는다(stale closure 방지).
// 정책(무엇을 할지)은 여기, 메커니즘(어떻게 회전/삭제할지)은 도메인/App 콜백이 맡는다.
// R·Del은 모드마다 다른 일을 한다 — 그 분기가 여기 모여 있다.
import { useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { norm } from './geometry'
import type { Mode } from '../Viewer'
import type { DragStateSnapshot } from './useViewerDrag'

type ShortcutCallbacks = {
  onUnitsRotate?: (rots: { id: string; rot: number }[]) => void
  onUnitsDelete?: (ids: string[]) => void
  onOutdoorsDelete?: (ids: string[]) => void
}

export interface ViewerShortcutsInput {
  st: RefObject<DragStateSnapshot>
  cbRef: RefObject<ShortcutCallbacks>
  setMode: Dispatch<SetStateAction<Mode>>
  setSpaceDown: (b: boolean) => void
  setSelUnits: Dispatch<SetStateAction<Set<string>>>
  setSelOdu: (id: string | null) => void
  setToolMenuOpen: (b: boolean) => void
  resetView: () => void
  onSelectionChange: (ids: string[]) => void
  onEscape?: () => void
  // 슬라이스/병합 진입·회전은 렌더마다 identity가 바뀔 수 있어 ref로 최신값을 읽는다.
  enterSlice: () => void
  enterMerge: () => void
  rotateSlice: () => void
}

export function useViewerShortcuts(input: ViewerShortcutsInput): void {
  const { st, cbRef, setMode, setSpaceDown, setSelUnits, setSelOdu, setToolMenuOpen, resetView, onSelectionChange, onEscape, enterSlice, enterMerge, rotateSlice } = input

  // window 리스너는 1회만 등록된다 → 최신 함수를 ref로 읽는다(stale closure 방지).
  // ref 갱신은 렌더 중이 아니라 이펙트에서 한다(이벤트는 커밋 후 발생하므로 최신값을 본다).
  const enterSliceRef = useRef(enterSlice)
  const enterMergeRef = useRef(enterMerge)
  const rotateSliceRef = useRef(rotateSlice)
  useEffect(() => {
    enterSliceRef.current = enterSlice
    enterMergeRef.current = enterMerge
    rotateSliceRef.current = rotateSlice
  })
  const spaceRef = useRef(false)

  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      if (e.code === 'Space') { e.preventDefault(); if (!spaceRef.current) { spaceRef.current = true; setSpaceDown(true) } return }
      const k = e.key.toLowerCase()
      if (k === 'c') setMode('cassette')
      else if (k === 'z') setMode('zone')
      else if (k === 'o') setMode('outdoor')
      else if (k === 'h') setMode('pan')
      else if (k === 'v') enterSliceRef.current()
      else if (k === 'm') enterMergeRef.current()
      else if (k === '0') resetView()
      else if (k === 'r') {
        // R은 모드마다 다른 일을 한다. 에어컨: 선택 실내기 90° 회전 / 자르기: 라인 15° 회전.
        if (st.current!.mode === 'cassette') {
          e.preventDefault()
          const sel = st.current!.selUnits
          if (sel.size) {
            const rots = st.current!.symbols
              .filter((s) => sel.has(s.id))
              .map((s) => ({ id: s.id, rot: norm((Math.floor(s.rot / 90) + 1) * 90) }))
            cbRef.current!.onUnitsRotate?.(rots)
          }
        } else if (st.current!.mode === 'slice') {
          e.preventDefault()
          rotateSliceRef.current() // 직선은 180°면 제자리로 돌아온다
        }
      } else if (k === 'delete' || k === 'backspace') {
        // 숨긴 레이어는 지울 수 없다 — 안 보이는 실내기가 사라지면 대수·조합비가 조용히 틀어진다.
        if (st.current!.mode === 'cassette' && st.current!.layers.indoor) {
          e.preventDefault()
          const sel = st.current!.selUnits
          // 심볼 삭제 = 실내기 대수 감소. 선정표·조합비가 즉시 따라온다.
          if (sel.size) { cbRef.current!.onUnitsDelete?.(Array.from(sel)); setSelUnits(new Set()) }
        } else if (st.current!.mode === 'outdoor' && st.current!.layers.outdoor) {
          e.preventDefault()
          const id = st.current!.selOdu
          // 실외기 심볼 삭제 = 도면에서 뺀 것. 그룹 자체는 남는다(가드가 '미배치'로 잡는다).
          if (id) { cbRef.current!.onOutdoorsDelete?.([id]); setSelOdu(null) }
        }
      } else if (k === 'escape') {
        // Esc는 '지금 하던 걸 취소한다'는 보편적 계약이다 — 자르기/병합 모드에서 빠져나온다.
        // (안 그러면 사용자가 취소했다고 믿은 채 클릭해 실을 자른다 — 적대적 QA)
        // 모드가 바뀌면 useMergeMode가 mergeFirst/hoverZone을 정리한다(렌더 감지).
        setMode((m) => (m === 'slice' || m === 'merge' ? 'cassette' : m))
        setSelUnits(new Set()); setSelOdu(null); onSelectionChange([]); setToolMenuOpen(false); onEscape?.()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceRef.current = false; setSpaceDown(false) } }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEscape, onSelectionChange, resetView])
}

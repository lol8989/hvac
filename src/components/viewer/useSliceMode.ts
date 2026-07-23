// 실 자르기(V) 모드 — 커서를 지나는 무한 직선으로 실 하나를 둘로 가른다.
//
// 자르기는 실내기 배치 단계 전용 도구다(검출 결과 다듬기). 실제 절단은 도메인(App)이 하고,
// 뷰어는 각도·커서·프리뷰를 쥐고 클릭 시 대상 실 id + 절단선을 올린다.
// 게이트가 '진입 시점'에만 있으면 단계를 넘긴 뒤에도 클릭이 실을 자른다 → 허용 안 되면 모드에서 빠져나온다.
import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ROT_STEP, zoneOfPoint } from './geometry'
import type { Pt, ZoneBox } from './geometry'
import type { ViewBox } from './usePanZoom'
import type { SliceLine, Mode } from './props'

export interface SlicePreview {
  x1: number; y1: number; x2: number; y2: number
  target: ZoneBox | null // 절단선이 지나는 실(강조 표시)
}

export interface SliceModeInput {
  mode: Mode
  setMode: Dispatch<SetStateAction<Mode>>
  zones: ZoneBox[]
  canSliceRooms: boolean
  snapOn: boolean
  gridStep: number
  zoneLayerVisible: boolean // 숨긴 실은 자를 수 없다(안 보이는 것을 편집하지 않는다)
  view: ViewBox // 프리뷰 선 길이를 화면 크기에 맞춘다(줌 무관하게 화면을 가로지름)
  onSliceUnavailable?: () => void
  onRoomSlice?: (roomId: string, line: SliceLine) => void
}

export interface SliceMode {
  isSlice: boolean
  sliceAngle: number
  sliceCursor: Pt | null
  slicePreview: SlicePreview | null
  enterSlice: () => void
  rotate: () => void // R: 15°씩 회전(직선은 180°면 제자리)
  trackCursor: (p: Pt) => void
  clearCursor: () => void
  commitAt: (p: Pt) => void // 클릭 시 대상 실을 자른다
}

export function useSliceMode(input: SliceModeInput): SliceMode {
  const { mode, setMode, zones, canSliceRooms, snapOn, gridStep, zoneLayerVisible, view, onSliceUnavailable, onRoomSlice } = input
  const [sliceAngle, setSliceAngle] = useState(90) // 기본은 세로선
  const [sliceCursor, setSliceCursor] = useState<Pt | null>(null)
  const isSlice = mode === 'slice'

  // 진입(V). 허용되지 않는 단계면 모드로 들어가지 않고 App이 이유를 알린다.
  const enterSlice = useCallback(() => {
    if (!canSliceRooms) { onSliceUnavailable?.(); return }
    setMode('slice')
  }, [canSliceRooms, onSliceUnavailable, setMode])

  // 자르기가 더 이상 허용되지 않는 단계로 넘어가면 모드에서 빠져나온다(적대적 QA).
  // 이펙트 대신 렌더 중 변화 감지(setMode·setSliceCursor 모두 Viewer 렌더의 자체 상태라 허용).
  const [prevCanSlice, setPrevCanSlice] = useState(canSliceRooms)
  if (prevCanSlice !== canSliceRooms) {
    setPrevCanSlice(canSliceRooms)
    if (!canSliceRooms) { setMode((m) => (m === 'slice' ? 'cassette' : m)); setSliceCursor(null) }
  }
  // 모드가 바뀌면 프리뷰 커서를 버린다 — 남아 있으면 '강조된 실'과 '잘리는 실'이 달라진다.
  const [prevMode, setPrevMode] = useState(mode)
  if (prevMode !== mode) {
    setPrevMode(mode)
    if (mode !== 'slice') setSliceCursor(null)
  }

  const rotate = useCallback(() => setSliceAngle((a) => (a + ROT_STEP) % 180), [])
  const trackCursor = useCallback((p: Pt) => setSliceCursor({ x: p.x, y: p.y }), [])
  const clearCursor = useCallback(() => setSliceCursor(null), [])

  // 클릭: 격자 ON이면 절단선도 격자에 맞춘다. 단, 스냅점이 실 밖이면 스냅을 포기한다(그 선은 실을 못 가른다).
  const commitAt = useCallback((p: Pt) => {
    if (!zoneLayerVisible) return
    const cx = snapOn ? Math.round(p.x / gridStep) * gridStep : p.x
    const cy = snapOn ? Math.round(p.y / gridStep) * gridStep : p.y
    const snapped = zoneOfPoint(cx, cy, zones)
    const raw = zoneOfPoint(p.x, p.y, zones)
    if (snapped) onRoomSlice?.(snapped.id, { x: cx, y: cy, angleDeg: sliceAngle })
    else if (raw) onRoomSlice?.(raw.id, { x: p.x, y: p.y, angleDeg: sliceAngle })
  }, [zoneLayerVisible, snapOn, gridStep, zones, sliceAngle, onRoomSlice])

  // 자르기 라인 프리뷰: 커서를 지나는 긴 직선 + 지나는 실 강조.
  const slicePreview = useMemo<SlicePreview | null>(() => {
    if (!isSlice || !sliceCursor) return null
    const rad = (sliceAngle * Math.PI) / 180
    const len = (view.w + view.h) * 2
    const dx = Math.cos(rad) * len
    const dy = Math.sin(rad) * len
    const target = zoneOfPoint(sliceCursor.x, sliceCursor.y, zones)
    return { x1: sliceCursor.x - dx, y1: sliceCursor.y - dy, x2: sliceCursor.x + dx, y2: sliceCursor.y + dy, target }
  }, [isSlice, sliceCursor, sliceAngle, zones, view.w, view.h])

  return { isSlice, sliceAngle, sliceCursor, slicePreview, enterSlice, rotate, trackCursor, clearCursor, commitAt }
}

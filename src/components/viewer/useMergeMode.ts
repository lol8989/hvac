// 실 병합(M) 모드 — 붙어 있는 두 실을 하나로. 자르기의 역연산(같은 검출 단계 전용).
//
// 첫 클릭으로 실 하나를 잡고(mergeFirst), 두 번째로 붙어 있는 실을 클릭하면 합친다.
// 인접 여부의 최종 판정은 도메인(App)이 한다 — 뷰어는 isAdjacent로 물어 프리뷰만 그린다.
// 게이트가 '진입 시점'에만 있으면 단계를 넘긴 뒤에도 클릭이 실을 합친다 → 허용 안 되면 모드에서 빠져나온다.
import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { zoneOfPoint } from './geometry'
import type { Pt, ZoneBox } from './geometry'
import type { Mode } from './props'

export interface MergePreview {
  first: ZoneBox | null // 1차 선택 실(굵게)
  hover: ZoneBox | null // 커서 아래 실(붙어 있으면 강조)
  adjacent: boolean // 두 실이 붙어 있는가(첫 실 전에는 true로 둔다)
}

export interface MergeModeInput {
  mode: Mode
  setMode: Dispatch<SetStateAction<Mode>>
  zones: ZoneBox[]
  canMergeRooms: boolean
  zoneLayerVisible: boolean
  isAdjacent?: (aId: string, bId: string) => boolean
  onMergeUnavailable?: () => void
  onRoomsMerge?: (aId: string, bId: string) => void
}

export interface MergeMode {
  isMerge: boolean
  mergePreview: MergePreview | null
  enterMerge: () => void
  commitAt: (p: Pt) => void // 클릭: 첫 실 잡기 / 두 번째 실과 합치기 / 같은 실 재클릭 해제
  trackHover: (p: Pt) => void // 커서 아래 실 추적(프리뷰)
}

export function useMergeMode(input: MergeModeInput): MergeMode {
  const { mode, setMode, zones, canMergeRooms, zoneLayerVisible, isAdjacent, onMergeUnavailable, onRoomsMerge } = input
  const [mergeFirst, setMergeFirst] = useState<string | null>(null)
  const [hoverZone, setHoverZone] = useState<string | null>(null)
  const isMerge = mode === 'merge'

  const enterMerge = useCallback(() => {
    if (!canMergeRooms) { onMergeUnavailable?.(); return }
    setMergeFirst(null)
    setMode('merge')
  }, [canMergeRooms, onMergeUnavailable, setMode])

  // 병합이 더 이상 허용되지 않는 단계로 넘어가면 모드에서 빠져나온다(적대적 QA) — 렌더 중 변화 감지.
  const [prevCanMerge, setPrevCanMerge] = useState(canMergeRooms)
  if (prevCanMerge !== canMergeRooms) {
    setPrevCanMerge(canMergeRooms)
    if (!canMergeRooms) { setMode((m) => (m === 'merge' ? 'cassette' : m)); setMergeFirst(null) }
  }
  // 병합 모드에서 나가면 프리뷰 상태를 버린다.
  const [prevMode, setPrevMode] = useState(mode)
  if (prevMode !== mode) {
    setPrevMode(mode)
    if (mode !== 'merge') { setMergeFirst(null); setHoverZone(null) }
  }

  // 클릭: 숨긴 실은 합칠 수 없다. 첫 클릭 잡기 → 두 번째 다른 실과 합치기 → 같은 실 재클릭은 해제.
  const commitAt = useCallback((p: Pt) => {
    if (!zoneLayerVisible) return
    const z = zoneOfPoint(p.x, p.y, zones)
    if (!z) { setMergeFirst(null); return }
    if (!mergeFirst) { setMergeFirst(z.id); return }
    if (z.id === mergeFirst) { setMergeFirst(null); return } // 같은 실을 다시 누르면 선택 해제
    onRoomsMerge?.(mergeFirst, z.id) // 인접 여부는 App(도메인)이 최종 판정한다
    setMergeFirst(null)
  }, [zoneLayerVisible, zones, mergeFirst, onRoomsMerge])

  const trackHover = useCallback((p: Pt) => setHoverZone(zoneOfPoint(p.x, p.y, zones)?.id ?? null), [zones])

  // 병합 프리뷰: 1차 선택 실은 굵게, 커서 아래 실은 '붙어 있으면' 강조하고 아니면 안 된다고 알린다.
  const mergePreview = useMemo<MergePreview | null>(() => {
    if (!isMerge) return null
    const first = mergeFirst ? zones.find((z) => z.id === mergeFirst) ?? null : null
    const hover = hoverZone && hoverZone !== mergeFirst ? zones.find((z) => z.id === hoverZone) ?? null : null
    // 첫 실을 고르기 전에는 '붙어 있는지'를 물을 수 없다 — 그냥 커서 아래 실을 강조한다.
    const adjacent = !first || !hover ? true : (isAdjacent?.(first.id, hover.id) ?? true)
    return { first, hover, adjacent }
  }, [isMerge, mergeFirst, hoverZone, zones, isAdjacent])

  return { isMerge, mergePreview, enterMerge, commitAt, trackHover }
}

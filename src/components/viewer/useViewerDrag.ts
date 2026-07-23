// 드래그 멀티플렉서 — 하나의 window 리스너가 6가지 드래그(팬·리사이즈·회전·이동·실외기·마퀴)를 처리한다.
//
// 드래그는 화면 밖으로 나가도 이어져야 하므로 window에 mousemove/up을 1회 등록한다(요소가 아니라).
// 어떤 드래그가 진행 중인지는 ref 하나씩으로 구분하고, 마우스를 뗄 때 draft를 App에 한 번만 커밋한다.
// 뷰어의 mousedown 핸들러는 '선택'을 처리하고 여기 begin* 메서드로 드래그를 연다(정책/메커니즘 분리).
import { useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { ROT_STEP, ROT_SENS, norm, rectPoints, zoneHitsRect, unitsInRect, resizeRectFromCorner } from './geometry'
import { snapTo } from './planGrid'
import type { Corner, Pt, UnitSym, ZoneBox } from './geometry'
import type { ViewBox } from './usePanZoom'
import type { Draft } from './useDraftCommit'
import type { Mode, LayerVisibility } from './props'

// window 리스너가 stale closure 없이 읽는 현재 편집 상태 스냅샷(뷰어가 매 렌더 갱신).
export interface DragStateSnapshot {
  mode: Mode
  symbols: UnitSym[]
  zones: ZoneBox[]
  selUnits: Set<string>
  selectedIds: string[]
  snapOn: boolean
  gridStep: number // 격자 간격(정규화 단위) — 표시 격자와 같은 값(planGrid.ts). 좌표계마다 다르므로 스냅도 여기 붙는다
  selOdu: string | null
  layers: LayerVisibility
}

type UnitDraft = Draft<Record<string, { x?: number; y?: number; rot?: number }>>
type OduDraft = Draft<{ id: string; x: number; y: number }>
type ZoneDraft = Draft<{ id: string; points: Pt[] }>
type DragCallbacks = {
  onUnitsMove?: (moves: { id: string; x: number; y: number }[]) => void
  onUnitsRotate?: (rots: { id: string; rot: number }[]) => void
  onOutdoorsMove?: (moves: { id: string; x: number; y: number }[]) => void
  onZoneResize?: (roomId: string, points: readonly Pt[]) => void
}

export interface ViewerDragInput {
  st: RefObject<DragStateSnapshot>
  svgRef: RefObject<SVGSVGElement | null>
  view: ViewBox
  toSvg: (cx: number, cy: number) => DOMPoint | null
  setView: Dispatch<SetStateAction<ViewBox>>
  setMarquee: Dispatch<SetStateAction<ViewBox | null>>
  setPanning: (b: boolean) => void
  setRotatingId: (id: string | null) => void
  setSelUnits: Dispatch<SetStateAction<Set<string>>>
  onSelectionChange: (ids: string[]) => void
  unitDraft: UnitDraft
  oduDraft: OduDraft
  zoneDraft: ZoneDraft
  cbRef: RefObject<DragCallbacks>
}

export interface ViewerDrag {
  startPan: (cx: number, cy: number) => void
  beginMarquee: (sx: number, sy: number, additive: boolean) => void
  beginUnitDrag: (orig: Record<string, { x: number; y: number }>, start: Pt) => void
  beginRotate: (orig: Record<string, number>, startX: number) => void
  beginOduDrag: (id: string, start: Pt, orig: { x: number; y: number }) => void
  beginZoneResize: (id: string, corner: Corner, anchor: Pt) => void
}

export function useViewerDrag(input: ViewerDragInput): ViewerDrag {
  const { st, svgRef, view, toSvg, setView, setMarquee, setPanning, setRotatingId, setSelUnits, onSelectionChange, unitDraft, oduDraft, zoneDraft, cbRef } = input

  // 진행 중인 드래그 세션(하나만 활성). 각 begin*이 채우고, onMove/onUp이 읽는다.
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; a: number; d: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; orig: Record<string, { x: number; y: number }>; moved: boolean } | null>(null)
  const rotRef = useRef<{ startX: number; orig: Record<string, number> } | null>(null)
  const cornerRef = useRef<{ id: string; corner: Corner; ax: number; ay: number } | null>(null)
  const marqRef = useRef<{ sx: number; sy: number; additive: boolean } | null>(null)
  const oduRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null)

  // 통합 드래그 처리(팬/리사이즈/회전/이동/마퀴) — window 리스너로 화면 밖 지속.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pn = panRef.current
      if (pn) {
        setView((v) => ({ ...v, x: pn.vx - (e.clientX - pn.sx) / pn.a, y: pn.vy - (e.clientY - pn.sy) / pn.d }))
        return
      }
      const c = cornerRef.current
      if (c) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        const g = st.current!.gridStep
        const px = st.current!.snapOn ? snapTo(p.x, g) : p.x
        const py = st.current!.snapOn ? snapTo(p.y, g) : p.y
        const r = resizeRectFromCorner(c.corner, { x: c.ax, y: c.ay }, { x: px, y: py }, g)
        zoneDraft.set({ id: c.id, points: rectPoints(r.x, r.y, r.w, r.h) })
        return
      }
      const r = rotRef.current
      if (r) {
        const delta = (e.clientX - r.startX) * ROT_SENS
        const next: Record<string, { rot: number }> = {}
        for (const id of Object.keys(r.orig)) next[id] = { rot: norm(Math.round((r.orig[id] + delta) / ROT_STEP) * ROT_STEP) }
        unitDraft.set(next)
        return
      }
      const d = dragRef.current
      if (d) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        let dx = p.x - d.startX, dy = p.y - d.startY
        if (st.current!.snapOn) { dx = snapTo(dx, st.current!.gridStep); dy = snapTo(dy, st.current!.gridStep) }
        if (Math.abs(p.x - d.startX) > 3 || Math.abs(p.y - d.startY) > 3) d.moved = true
        const next: Record<string, { x: number; y: number }> = {}
        for (const [id, o] of Object.entries(d.orig)) next[id] = { x: o.x + dx, y: o.y + dy }
        unitDraft.set(next)
        return
      }
      const od = oduRef.current
      if (od) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        let dx = p.x - od.startX, dy = p.y - od.startY
        if (st.current!.snapOn) { dx = snapTo(dx, st.current!.gridStep); dy = snapTo(dy, st.current!.gridStep) }
        oduDraft.set({ id: od.id, x: od.ox + dx, y: od.oy + dy })
        return
      }
      const mq = marqRef.current
      if (mq) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        setMarquee({ x: Math.min(mq.sx, p.x), y: Math.min(mq.sy, p.y), w: Math.abs(p.x - mq.sx), h: Math.abs(p.y - mq.sy) })
      }
    }
    // 드래그/회전 draft를 App(Placement)에 한 번만 커밋하고 draft를 비운다.
    const commitDraft = (kind: 'move' | 'rotate') => {
      const d = unitDraft.ref.current
      unitDraft.clear()
      if (!d) return
      if (kind === 'move') {
        const moves = Object.entries(d)
          .filter(([, v]) => v.x !== undefined && v.y !== undefined)
          .map(([id, v]) => ({ id, x: v.x as number, y: v.y as number }))
        if (moves.length) cbRef.current!.onUnitsMove?.(moves)
      } else {
        const rots = Object.entries(d)
          .filter(([, v]) => v.rot !== undefined)
          .map(([id, v]) => ({ id, rot: v.rot as number }))
        if (rots.length) cbRef.current!.onUnitsRotate?.(rots)
      }
    }
    const onUp = () => {
      if (panRef.current) { panRef.current = null; setPanning(false); return }
      if (oduRef.current) {
        oduRef.current = null
        const d = oduDraft.ref.current
        oduDraft.clear()
        if (d) cbRef.current!.onOutdoorsMove?.([d])
        return
      }
      if (cornerRef.current) {
        cornerRef.current = null
        const zd = zoneDraft.ref.current
        zoneDraft.clear()
        if (zd) cbRef.current!.onZoneResize?.(zd.id, zd.points) // 형상은 App이 소유한다
        return
      }
      if (rotRef.current) { rotRef.current = null; setRotatingId(null); commitDraft('rotate'); return }
      if (marqRef.current) {
        const m = marqRef.current
        setMarquee((rect) => {
          if (rect) {
            const big = rect.w > 3 || rect.h > 3
            const s = st.current!
            if (s.mode === 'zone') {
              if (big && s.layers.zone) {
                const hits = s.zones.filter((z) => zoneHitsRect(rect, z)).map((z) => z.id)
                onSelectionChange(Array.from(new Set([...(m.additive ? s.selectedIds : []), ...hits])))
              } else if (!m.additive) onSelectionChange([])
            } else if (s.mode === 'cassette') {
              if (big && s.layers.indoor) {
                const hits = unitsInRect(s.symbols, rect)
                const base = m.additive ? new Set(s.selUnits) : new Set<string>()
                hits.forEach((id) => base.add(id))
                setSelUnits(base)
              } else if (!m.additive) setSelUnits(new Set())
            }
          }
          return null
        })
        marqRef.current = null
      }
      if (dragRef.current) {
        dragRef.current = null
        commitDraft('move')
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toSvg, onSelectionChange])

  // ── 드래그 시작(begin*): 뷰어의 mousedown 핸들러가 선택을 처리한 뒤 부른다 ──
  const startPan = (cx: number, cy: number) => {
    const ctm = svgRef.current?.getScreenCTM(); if (!ctm) return
    panRef.current = { sx: cx, sy: cy, vx: view.x, vy: view.y, a: ctm.a, d: ctm.d }
    setPanning(true)
  }
  const beginMarquee = (sx: number, sy: number, additive: boolean) => {
    marqRef.current = { sx, sy, additive }
    setMarquee({ x: sx, y: sy, w: 0, h: 0 })
  }
  const beginUnitDrag = (orig: Record<string, { x: number; y: number }>, start: Pt) => {
    dragRef.current = { startX: start.x, startY: start.y, orig, moved: false }
  }
  const beginRotate = (orig: Record<string, number>, startX: number) => {
    rotRef.current = { startX, orig }
  }
  const beginOduDrag = (id: string, start: Pt, orig: { x: number; y: number }) => {
    oduRef.current = { id, startX: start.x, startY: start.y, ox: orig.x, oy: orig.y }
  }
  const beginZoneResize = (id: string, corner: Corner, anchor: Pt) => {
    cornerRef.current = { id, corner, ax: anchor.x, ay: anchor.y }
  }

  return { startPan, beginMarquee, beginUnitDrag, beginRotate, beginOduDrag, beginZoneResize }
}

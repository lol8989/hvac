import { useRef, useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import type { ReactElement } from 'react'
import type { Room } from '../data'
import ACUnit from './viewer/ACUnit'
import ODUnit from './viewer/ODUnit'
import ZoneRect from './viewer/ZoneRect'
import { GRID, ROT_STEP, ROT_SENS, snap, norm, rectsIntersect, roomIdsForUnits, zoneAreaM2 } from './viewer/geometry'
import type { UnitSym, ZoneBox, Corner } from './viewer/geometry'

type Mode = 'cassette' | 'zone' | 'pan' | 'outdoor' // 에어컨(실내기) / 존(실) / 손 / 실외기

// 도면 폭에 맞는 '딱 떨어지는' 격자 실치수(1·2·5·10 계열, ~100칸 목표). 대형 mm 좌표계용.
const niceGrid = (w: number): number => {
  const target = w / 100
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  return [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= target) ?? 10 * pow
}
interface ViewBox { x: number; y: number; w: number; h: number }

// ＋실내기 수동 추가 시 선택 가능한 실내기 유형(도면 심볼 태그).
const IDU_KINDS: readonly string[] = ['벽걸이형', '2WAY', '4WAY']

// 단축키 도움말(플로팅 위젯) — 단축키 하나당 한 행.
const SHORTCUTS: readonly { key: string; desc: string }[] = [
  { key: 'C', desc: '에어컨(실내기) 모드' },
  { key: 'Z', desc: '존(실) 모드' },
  { key: 'O', desc: '실외기 모드' },
  { key: 'H', desc: '손(화면 이동) 모드' },
  { key: 'Space', desc: '누르는 동안 화면 이동' },
  { key: '휠', desc: '확대 / 축소' },
  { key: '0', desc: '화면 맞춤' },
  { key: '드래그', desc: '이동 / 영역 선택' },
  { key: 'Shift', desc: '선택 추가' },
  { key: 'R', desc: '90° 회전' },
  { key: '⟳', desc: '회전 핸들 15°' },
  { key: 'Del', desc: '실내기 삭제' },
  { key: 'Esc', desc: '선택 해제' },
]

// 레이어 필터: 툴바 셀렉트에서 선택 — 해당 레이어만 표시(도면 배경은 항상 표시).
export type LayerFilter = 'all' | 'zone' | 'indoor' | 'outdoor'
export const LAYER_OPTIONS: readonly { value: LayerFilter; label: string }[] = [
  { value: 'all', label: '레이어: 전체' },
  { value: 'indoor', label: '실내기' },
  { value: 'outdoor', label: '실외기' },
  { value: 'zone', label: '실 경계' },
]

// 실외기 배치용 그룹 요약(도면 심볼 라벨·모델).
export interface OutdoorGroupInfo {
  key: string
  label: string
  model: string
}

// 딥줌 타일 피라미드 매니페스트(tools/dxf_to_tiles.py 산출).
export interface TileLevel { z: number; pxW: number; pxH: number; cols: number; rows: number }
export interface TileManifest {
  tile: number
  levels: TileLevel[]
  masterPx: [number, number]
  worldMin: [number, number]
  worldMax: [number, number]
  units: string
}

interface ViewerProps {
  rooms: Record<string, Room>
  selectedIds: string[] // 선택된 실(존) id — ModelPanel 연동
  onSelectionChange: (ids: string[]) => void
  onEscape?: () => void
  tiles?: TileManifest // 딥줌 타일 매니페스트(보이는 타일만 로드)
  tileBase?: string // 타일 URL 베이스(예: /tiles)
  indoorInfo?: Record<string, { model: string; kind: string }> // 실별 실내기 모델명·유형(심볼 오버레이)
  outdoorGroups?: OutdoorGroupInfo[] // 실외기 배치 대상 그룹(placeOutdoors)
  planW?: number // 도면 정규화 좌표 폭(기본 720 목업 / 실도면은 종횡비 유지 폭)
  planH?: number // 도면 정규화 좌표 높이(기본 470)
  mmPerUnit?: number // 정규화 1단위 = 실 mm (격자 실치수 표기 + DXF 왕복)
  layerFilter?: LayerFilter // 표시 레이어 필터(기본 all)
  canAddUnit?: boolean // ＋실내기 수동 추가 허용 — 실검출·AI 배치 완료 전에는 비활성
  canPlaceOutdoors?: boolean // ＋실외기 배치 허용 — '실외기 배치' 단계에서만 활성
}

// App 버튼에서 호출하는 명령형 핸들.
export interface ViewerHandle {
  placeUnits: () => void // 방별로 실내기 심볼을 자동 배치(빈 상태 → 채움)
  placeOutdoors: () => void // 그룹별 실외기 심볼을 도면 하단(건물 외부)에 배치
  captureSvg: () => string | null // 현재 도면 SVG 직렬화(캡처 다운로드용)
}

/**
 * SVG 도면 뷰어(편집). 모드: 에어컨(C)=실내기 이동/회전/삭제, 존(Z)=실 선택/모서리 리사이즈, 손(H)=팬.
 * 휠=커서 기준 줌, Space/손=팬, 드래그=영역 다중선택(마퀴). 뷰어 로컬 상태(POC).
 * 좌표계는 planW×planH(목업 720×470 또는 실도면 DXF 월드 mm) 기준.
 */
const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  { rooms, selectedIds, onSelectionChange, onEscape, tiles, tileBase, indoorInfo, outdoorGroups, planW, planH, mmPerUnit, layerFilter = 'all', canAddUnit = true, canPlaceOutdoors = false }: ViewerProps,
  ref,
) {
  // 도면 좌표계 상수(프롭 기반). 실도면(대형 mm)이면 패딩·격자 간격을 비례 조정.
  const PLAN_W = planW ?? 720
  const PLAN_H = planH ?? 470
  const FIT = useMemo(() => {
    const px = PLAN_W * 0.05, py = PLAN_H * 0.06
    return { x: -px, y: -py, w: PLAN_W + 2 * px, h: PLAN_H + 2 * py }
  }, [PLAN_W, PLAN_H])
  const BASE_W = FIT.w
  const MIN_W = BASE_W / 8
  const MAX_W = BASE_W * 3
  // 격자 표시 간격: 실도면이면 딱 떨어지는 실치수(예: 2m)를 정규화 단위로 환산, 목업이면 기존 GRID.
  const gridMm = mmPerUnit ? niceGrid(PLAN_W * mmPerUnit) : null // 격자 1칸의 실 치수(mm)
  const gridStep = gridMm ? gridMm / (mmPerUnit as number) : GRID
  const gridLabel = gridMm ? (gridMm >= 1000 ? `${gridMm / 1000}m` : `${gridMm}mm`) : null
  const clampW = useCallback((nw: number, nh: number): [number, number] => {
    if (nw < MIN_W) { const k = MIN_W / nw; return [nw * k, nh * k] }
    if (nw > MAX_W) { const k = MAX_W / nw; return [nw * k, nh * k] }
    return [nw, nh]
  }, [MIN_W, MAX_W])
  const [view, setView] = useState<ViewBox>(FIT)
  const [mode, setMode] = useState<Mode>('cassette')
  // 실내기 심볼은 초기엔 '비어 있고', 'AI 실내기 배치' 버튼(placeUnits)으로 채운다.
  // 심볼 식별자는 담당 실 id와 동일(실내기 = 그 실의 장비). 자유 추가 심볼만 'IDU_' 접두.
  const [symbols, setSymbols] = useState<UnitSym[]>([])
  const [zones, setZones] = useState<ZoneBox[]>(() =>
    Object.entries(rooms).map(([id, r]) => ({ id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h })),
  )
  const [selUnits, setSelUnits] = useState<Set<string>>(() => new Set())
  // 실외기 심볼: 'AI 실외기 배치'로 채운다. id = 그룹 key(ODU1..).
  const [outdoors, setOutdoors] = useState<UnitSym[]>([])
  const [selOdu, setSelOdu] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [marquee, setMarquee] = useState<ViewBox | null>(null)
  const [snapOn, setSnapOn] = useState(true)
  const [svgW, setSvgW] = useState(1200) // 화면상 SVG 폭(px) — 타일 레벨 선택용
  const [hintOpen, setHintOpen] = useState(true)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false) // ＋실내기 유형 선택 메뉴

  const svgRef = useRef<SVGSVGElement | null>(null)
  const idRef = useRef(Object.keys(rooms).length)
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; a: number; d: number } | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; orig: Record<string, { x: number; y: number }>; moved: boolean } | null>(null)
  const rotRef = useRef<{ startX: number; orig: Record<string, number> } | null>(null)
  const cornerRef = useRef<{ id: string; corner: Corner; ax: number; ay: number } | null>(null)
  const marqRef = useRef<{ sx: number; sy: number; additive: boolean } | null>(null)
  const oduRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null)
  const spaceRef = useRef(false)

  // 실외기 배치: 건물 외부(도면 하단)에 그룹당 하나씩 가로로 나열(폭에 비례 배치).
  // 도면 영역 ＋실외기 배치 버튼과 명령형 핸들이 공유한다(재호출 시 기본 배치로 리셋).
  const placeOutdoorsFn = useCallback(() => {
    const gs = outdoorGroups ?? []
    setOutdoors(gs.map((g, i) => ({ id: g.key, x: snap(PLAN_W * 0.12 + i * PLAN_W * 0.16), y: snap(PLAN_H + PLAN_H * 0.04), rot: 0 })))
    setMode('outdoor')
  }, [outdoorGroups, PLAN_W, PLAN_H])

  // 명령형 핸들: 실내기/실외기 자동 배치(재호출 시 기본 배치로 리셋).
  useImperativeHandle(ref, () => ({
    placeUnits: () =>
      setSymbols(Object.entries(rooms).map(([id, r]) => ({ id, x: snap(r.x + r.w / 2), y: snap(r.y + r.h / 2), rot: 0 }))),
    placeOutdoors: placeOutdoorsFn,
    captureSvg: () => (svgRef.current ? new XMLSerializer().serializeToString(svgRef.current) : null),
  }), [rooms, placeOutdoorsFn])

  // window 리스너(1회 등록)에서 읽는 최신 상태 스냅샷. 렌더 중이 아닌 effect에서 갱신(refs 규칙 준수).
  const st = useRef({ mode, symbols, zones, selUnits, selectedIds, snapOn, selOdu })
  useEffect(() => { st.current = { mode, symbols, zones, selUnits, selectedIds, snapOn, selOdu } })

  // SVG 화면 폭(px) 추적 — 타일 레벨 선택(화면 해상도 ≒ 타일 해상도)에 사용.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => setSvgW(el.clientWidth || 1200)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // C(에어컨) 모드: 선택된 실내기 심볼 → 담당 실을 패널 선택으로 반영(단일 클릭·드래그 동일 동작).
  // 실도 함께 하이라이팅됨(selectedIds→ZoneRect). 마운트 시 초기 선택 보존, 방 밖 심볼 무시, 같은 실 다중 심볼 합침.
  const firstSel = useRef(true)
  // 순방향 동기화(심볼→실)가 발신한 selectedIds 변경 표식 — 역방향에서 1회 건너뛴다.
  // 없으면 자유 심볼(IDU_) 클릭 → 실 선택 → 그 실의 바인딩 심볼까지 함께 선택되는 버그가 생긴다.
  const selFromSymbols = useRef(false)
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return }
    if (mode !== 'cassette') return
    const chosen = symbols.filter((s) => selUnits.has(s.id))
    const next = roomIdsForUnits(chosen, zones)
    const cur = st.current.selectedIds
    // 이미 동일하면 재호출 금지(역방향 동기화와의 핑퐁 루프 차단).
    if (next.length !== cur.length || !next.every((id) => cur.includes(id))) {
      selFromSymbols.current = true
      onSelectionChange(next)
    }
    // symbols·zones도 의존: 드래그로 심볼이 다른 실로 옮겨지면 하이라이팅이 따라간다.
    // mode는 제외 — 모드 전환만으로 존 모드에서 만든 실 선택을 지우지 않기 위함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selUnits, symbols, zones, onSelectionChange])

  // 역방향 동기화: 패널 등에서 실 선택(selectedIds)이 바뀌면 실내기 심볼 선택도 맞춘다.
  //  · 선택된 장비 목록에서 체크 해제 → 해당 실내기 심볼 선택도 함께 해제(하이라이트 정리)
  //  · 방-바인딩 심볼(id=실id)은 selectedIds를 따르고, 자유 심볼(IDU_)은 로컬 선택 유지
  //  · 이미 일치하면 prev를 그대로 반환해 setState/루프를 막는다
  //  · 순방향(심볼 클릭)이 발신한 변경이면 스킵 — 클릭한 심볼만 선택 유지(동일 존 심볼 오선택 방지)
  useEffect(() => {
    if (selFromSymbols.current) { selFromSymbols.current = false; return }
    setSelUnits((prev) => {
      const zoneIds = new Set(zones.map((z) => z.id))
      const desired = new Set<string>()
      for (const id of prev) if (!zoneIds.has(id)) desired.add(id) // 자유 심볼 유지
      for (const s of symbols) if (selectedIds.includes(s.id)) desired.add(s.id)
      const same = prev.size === desired.size && [...prev].every((x) => desired.has(x))
      return same ? prev : desired
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds])

  const zoomPct = Math.round((BASE_W / view.w) * 100)
  const panActive = mode === 'pan' || spaceDown

  const toSvg = useCallback((cx: number, cy: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = cx
    pt.y = cy
    return pt.matrixTransform(ctm.inverse())
  }, [])

  // 휠 확대/축소: 커서 아래 지점 고정.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const p = pt.matrixTransform(ctm.inverse())
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      setView((v) => {
        const [nw, nh] = clampW(v.w * factor, v.h * factor)
        return { x: p.x - ((p.x - v.x) / v.w) * nw, y: p.y - ((p.y - v.y) / v.h) * nh, w: nw, h: nh }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [clampW])

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
        let px = st.current.snapOn ? snap(p.x) : p.x
        let py = st.current.snapOn ? snap(p.y) : p.y
        let nx: number, ny: number, nw: number, nh: number
        if (c.corner === 'br') { px = Math.max(px, c.ax + GRID); py = Math.max(py, c.ay + GRID); nx = c.ax; ny = c.ay; nw = px - c.ax; nh = py - c.ay }
        else if (c.corner === 'tl') { px = Math.min(px, c.ax - GRID); py = Math.min(py, c.ay - GRID); nx = px; ny = py; nw = c.ax - px; nh = c.ay - py }
        else if (c.corner === 'tr') { px = Math.max(px, c.ax + GRID); py = Math.min(py, c.ay - GRID); nx = c.ax; ny = py; nw = px - c.ax; nh = c.ay - py }
        else { px = Math.min(px, c.ax - GRID); py = Math.max(py, c.ay + GRID); nx = px; ny = c.ay; nw = c.ax - px; nh = py - c.ay }
        setZones((prev) => prev.map((z) => (z.id === c.id ? { ...z, x: nx, y: ny, w: nw, h: nh } : z)))
        return
      }
      const r = rotRef.current
      if (r) {
        const delta = (e.clientX - r.startX) * ROT_SENS
        setSymbols((prev) => prev.map((s) => (r.orig[s.id] !== undefined ? { ...s, rot: norm(Math.round((r.orig[s.id] + delta) / ROT_STEP) * ROT_STEP) } : s)))
        return
      }
      const d = dragRef.current
      if (d) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        let dx = p.x - d.startX, dy = p.y - d.startY
        if (st.current.snapOn) { dx = snap(dx); dy = snap(dy) }
        if (Math.abs(p.x - d.startX) > 3 || Math.abs(p.y - d.startY) > 3) d.moved = true
        setSymbols((prev) => prev.map((s) => { const o = d.orig[s.id]; return o ? { ...s, x: o.x + dx, y: o.y + dy } : s }))
        return
      }
      const od = oduRef.current
      if (od) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        let dx = p.x - od.startX, dy = p.y - od.startY
        if (st.current.snapOn) { dx = snap(dx); dy = snap(dy) }
        setOutdoors((prev) => prev.map((u) => (u.id === od.id ? { ...u, x: od.ox + dx, y: od.oy + dy } : u)))
        return
      }
      const mq = marqRef.current
      if (mq) {
        const p = toSvg(e.clientX, e.clientY); if (!p) return
        setMarquee({ x: Math.min(mq.sx, p.x), y: Math.min(mq.sy, p.y), w: Math.abs(p.x - mq.sx), h: Math.abs(p.y - mq.sy) })
      }
    }
    const onUp = () => {
      if (panRef.current) { panRef.current = null; setPanning(false); return }
      if (oduRef.current) { oduRef.current = null; return }
      if (cornerRef.current) { cornerRef.current = null; return }
      if (rotRef.current) { rotRef.current = null; setRotatingId(null); return }
      if (marqRef.current) {
        const m = marqRef.current
        setMarquee((rect) => {
          if (rect) {
            const big = rect.w > 3 || rect.h > 3
            const s = st.current
            if (s.mode === 'zone') {
              if (big) {
                const hits = s.zones.filter((z) => rectsIntersect(rect, z)).map((z) => z.id)
                onSelectionChange(Array.from(new Set([...(m.additive ? s.selectedIds : []), ...hits])))
              } else if (!m.additive) onSelectionChange([])
            } else if (s.mode === 'cassette') {
              if (big) {
                const hits = s.symbols.filter((u) => u.x >= rect.x && u.x <= rect.x + rect.w && u.y >= rect.y && u.y <= rect.y + rect.h).map((u) => u.id)
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
      dragRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [toSvg, onSelectionChange])

  // 단축키.
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
      else if (k === '0') setView(FIT)
      else if (k === 'r') {
        if (st.current.mode === 'cassette') {
          e.preventDefault()
          const sel = st.current.selUnits
          if (sel.size) setSymbols((prev) => prev.map((s) => (sel.has(s.id) ? { ...s, rot: norm((Math.floor(s.rot / 90) + 1) * 90) } : s)))
        }
      } else if (k === 'delete' || k === 'backspace') {
        if (st.current.mode === 'cassette') {
          e.preventDefault()
          const sel = st.current.selUnits
          if (sel.size) { setSymbols((prev) => prev.filter((s) => !sel.has(s.id))); setSelUnits(new Set()) }
        } else if (st.current.mode === 'outdoor') {
          e.preventDefault()
          const id = st.current.selOdu
          if (id) { setOutdoors((prev) => prev.filter((u) => u.id !== id)); setSelOdu(null) }
        }
      } else if (k === 'escape') {
        setSelUnits(new Set()); setSelOdu(null); onSelectionChange([]); setToolMenuOpen(false); setAddMenuOpen(false); onEscape?.()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceRef.current = false; setSpaceDown(false) } }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp) }
  }, [onEscape, onSelectionChange, FIT])

  const startPan = (cx: number, cy: number) => {
    const ctm = svgRef.current?.getScreenCTM(); if (!ctm) return
    panRef.current = { sx: cx, sy: cy, vx: view.x, vy: view.y, a: ctm.a, d: ctm.d }
    setPanning(true)
  }

  const onBgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panActive) { startPan(e.clientX, e.clientY); return }
    const p = toSvg(e.clientX, e.clientY); if (!p) return
    marqRef.current = { sx: p.x, sy: p.y, additive: e.shiftKey }
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  // 실내기 심볼: 선택 + 이동 시작.
  const onUnitDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { startPan(e.clientX, e.clientY); return }
    e.stopPropagation()
    let next: Set<string>
    if (e.shiftKey) {
      next = new Set(selUnits)
      if (next.has(id)) next.delete(id)
      else next.add(id)
    } else {
      next = selUnits.has(id) ? selUnits : new Set([id])
    }
    setSelUnits(next)
    const p = toSvg(e.clientX, e.clientY); if (!p) return
    const orig: Record<string, { x: number; y: number }> = {}
    symbols.forEach((s) => { if (next.has(s.id)) orig[s.id] = { x: s.x, y: s.y } })
    dragRef.current = { startX: p.x, startY: p.y, orig, moved: false }
  }

  const onRotateDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const ids = selUnits.has(id) && selUnits.size > 1 ? Array.from(selUnits) : [id]
    const orig: Record<string, number> = {}
    symbols.forEach((s) => { if (ids.includes(s.id)) orig[s.id] = s.rot })
    rotRef.current = { startX: e.clientX, orig }
    setRotatingId(id)
  }

  const onZoneDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { startPan(e.clientX, e.clientY); return }
    e.stopPropagation()
    if (e.shiftKey) onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
    else onSelectionChange([id])
  }

  // 실외기 심볼: 선택 + 이동 시작.
  const onODUDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { startPan(e.clientX, e.clientY); return }
    e.stopPropagation()
    setSelOdu(id)
    const p = toSvg(e.clientX, e.clientY); if (!p) return
    const o = outdoors.find((u) => u.id === id); if (!o) return
    oduRef.current = { id, startX: p.x, startY: p.y, ox: o.x, oy: o.y }
  }

  const onCornerDown = (e: React.MouseEvent, id: string, corner: Corner) => {
    e.stopPropagation()
    const z = zones.find((zz) => zz.id === id); if (!z) return
    let ax: number, ay: number // 반대편(고정) 모서리
    if (corner === 'tl') { ax = z.x + z.w; ay = z.y + z.h }
    else if (corner === 'tr') { ax = z.x; ay = z.y + z.h }
    else if (corner === 'bl') { ax = z.x + z.w; ay = z.y }
    else { ax = z.x; ay = z.y }
    cornerRef.current = { id, corner, ax, ay }
    onSelectionChange([id])
  }

  // 유형(벽걸이형/2WAY/4WAY)을 선택해 자유 심볼을 추가한다(＋실내기 메뉴).
  const addUnit = (kind: string) => {
    const id = 'IDU_' + ++idRef.current // 실과 무관한 자유 심볼(위치로 역참조)
    setSymbols((prev) => [...prev, { id, x: snap(view.x + view.w / 2), y: snap(view.y + view.h / 2), rot: 0, kind }])
    setSelUnits(new Set([id]))
    setMode('cassette')
  }

  const zoomButton = (factor: number) =>
    setView((v) => { const [nw, nh] = clampW(v.w * factor, v.h * factor); return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh } })

  // 딥줌: 현재 줌·뷰포트에 맞는 레벨의 '보이는 타일'만 렌더.
  const tileEls: ReactElement[] | null = (() => {
    if (!tiles || !tileBase) return null
    const T = tiles.tile
    const dppu = svgW / view.w // 화면 px per 정규화 단위
    let lv = tiles.levels[tiles.levels.length - 1]
    for (const L of tiles.levels) { if (L.pxW / PLAN_W >= dppu) { lv = L; break } }
    const vx0 = view.x, vx1 = view.x + view.w, vy0 = view.y, vy1 = view.y + view.h
    const els: ReactElement[] = []
    for (let x = 0; x < lv.cols; x++) {
      const tpxW = Math.min(T, lv.pxW - x * T)
      const nx = (PLAN_W * (x * T)) / lv.pxW
      const nw = (PLAN_W * tpxW) / lv.pxW
      if (nx + nw < vx0 || nx > vx1) continue
      for (let y = 0; y < lv.rows; y++) {
        const tpxH = Math.min(T, lv.pxH - y * T)
        const ny = (PLAN_H * (y * T)) / lv.pxH
        const nh = (PLAN_H * tpxH) / lv.pxH
        if (ny + nh < vy0 || ny > vy1) continue
        els.push(<image key={`${lv.z}-${x}-${y}`} href={`${tileBase}/${lv.z}/${x}_${y}.png`} x={nx} y={ny} width={nw} height={nh} />)
      }
    }
    return els
  })()

  const isCassette = mode === 'cassette'
  const isZone = mode === 'zone'
  const isOutdoor = mode === 'outdoor'
  // 레이어 필터: 선택된 레이어만 표시(전체면 모두).
  const layerOn = (name: LayerFilter): boolean => layerFilter === 'all' || layerFilter === name
  const modeLabel = mode === 'cassette' ? '에어컨' : mode === 'zone' ? '존(실)' : mode === 'outdoor' ? '실외기' : '손 (이동)'

  return (
    <div className="viewer">
      <div className="vhint">[휠: 확대/축소 · 드래그: 영역선택 · Space/손: 이동 · C·Z·H: 모드 · R: 90° · Del: 삭제]</div>

      <div className="vtools">
        <label className="vtoggle"><input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> 격자{gridLabel ? ` (${gridLabel})` : ''}</label>
      </div>
      {/* 도면 영역 상단 가운데: 배치 액션 — ＋실내기(실내기 배치 단계), ＋실외기 배치(실외기 배치 단계) */}
      <div className="vtools vtools-center">
        <button
          className="btn sm"
          onClick={() => setAddMenuOpen((o) => !o)}
          disabled={!canAddUnit}
          title={canAddUnit ? '유형을 선택해 실내기를 추가' : '실내기 배치 단계에서 AI 실내기 배치 완료 후 추가할 수 있습니다'}
        >＋ 실내기</button>
        {addMenuOpen && (
          <div className="addmenu">
            {IDU_KINDS.map((k) => (
              <button key={k} onClick={() => { addUnit(k); setAddMenuOpen(false) }}>{k}</button>
            ))}
          </div>
        )}
        <button
          className="btn sm"
          onClick={placeOutdoorsFn}
          disabled={!canPlaceOutdoors}
          title={canPlaceOutdoors ? '조합 그룹별 실외기를 도면 하단(건물 외부)에 배치' : "'실외기 배치' 단계에서 배치할 수 있습니다"}
        >＋ 실외기 배치</button>
      </div>

      <svg
        ref={svgRef}
        className={`plansvg${panActive ? ' panmode' : ''}${panning ? ' panning' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onBgDown}
      >
        <g className="drawing-layer">
          <rect x="0" y="0" width={PLAN_W} height={PLAN_H} fill="#ffffff" stroke="#CFCFCF" />
          {/* 그리드(스냅 격자) — 스냅 ON일 때만 표시. GRID 간격, 도면 시트 위. */}
          {snapOn && (
            <g>
              {Array.from({ length: Math.floor(PLAN_W / gridStep) + 1 }, (_, i) => i * gridStep).map((x) => (
                <line key={`gv${x}`} x1={x} y1={0} x2={x} y2={PLAN_H} stroke="#ECECEC" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {Array.from({ length: Math.floor(PLAN_H / gridStep) + 1 }, (_, i) => i * gridStep).map((y) => (
                <line key={`gh${y}`} x1={0} y1={y} x2={PLAN_W} y2={y} stroke="#ECECEC" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
            </g>
          )}
          {tileEls ? tileEls : (
            <text x={PLAN_W / 2} y={PLAN_H - 14} fontSize="10" textAnchor="middle" fill="#c8c8c8">도면 레이어 (딥줌 타일 마운트 지점)</text>
          )}
        </g>

        {/* 실(존) 레이어 */}
        <g style={{ pointerEvents: isZone ? 'auto' : 'none', opacity: isZone ? 1 : 0.85, display: layerOn('zone') ? undefined : 'none' }}>
          {zones.map((z) => {
            // 면적(㎡): 실도면이면 존 기하로 실시간 계산(리사이즈 반영), 목업이면 설계 면적.
            const a = zoneAreaM2(z, mmPerUnit, rooms[z.id]?.area)
            return (
              <ZoneRect
                key={z.id} z={z} editing={isZone && selectedIds.includes(z.id)} selected={selectedIds.includes(z.id)}
                areaText={a != null ? `${a.toFixed(1)}㎡` : undefined}
                onDown={onZoneDown} onCornerDown={onCornerDown}
              />
            )
          })}
        </g>

        {/* 실내기(에어컨) 레이어 */}
        <g style={{ pointerEvents: isCassette ? 'auto' : 'none', opacity: isCassette ? 1 : 0.5, display: layerOn('indoor') ? undefined : 'none' }}>
          {symbols.map((s) => (
            <ACUnit
              key={s.id} sym={s} selected={selUnits.has(s.id)} hovered={hoveredId === s.id} rotating={rotatingId === s.id}
              model={indoorInfo?.[s.id]?.model} kind={indoorInfo?.[s.id]?.kind ?? s.kind}
              onBodyDown={onUnitDown} onRotateDown={onRotateDown}
              onEnter={setHoveredId} onLeave={(id) => setHoveredId((h) => (h === id ? null : h))}
            />
          ))}
        </g>

        {/* 실외기 레이어 */}
        <g style={{ pointerEvents: isOutdoor ? 'auto' : 'none', opacity: isOutdoor ? 1 : 0.55, display: layerOn('outdoor') ? undefined : 'none' }}>
          {outdoors.map((u) => {
            const g = outdoorGroups?.find((x) => x.key === u.id)
            return (
              <ODUnit key={u.id} sym={u} selected={selOdu === u.id} label={g?.label ?? u.id} model={g?.model} onDown={onODUDown} />
            )
          })}
        </g>

        {marquee && (marquee.w > 0 || marquee.h > 0) && (
          <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(34,34,34,0.06)" stroke="#333333" strokeWidth={1} strokeDasharray="4 3" />
        )}
      </svg>

      {/* 하단 중앙 Figma식 도구바 */}
      <div className="figbar">
        <button className="figtool" onClick={() => setToolMenuOpen((o) => !o)} title="도구 선택">
          <span className="figtool-name">{modeLabel}</span>
          <span className="figtool-chev">▾</span>
        </button>
        {toolMenuOpen && (
          <div className="figmenu">
            <button className={`figitem${isCassette ? ' active' : ''}`} onClick={() => { setMode('cassette'); setToolMenuOpen(false) }}>
              <span className="tt"><b>에어컨 (실내기)</b><span>선택 · 이동 · 회전 · 삭제</span></span><span className="kk">C</span>
            </button>
            <button className={`figitem${isZone ? ' active' : ''}`} onClick={() => { setMode('zone'); setToolMenuOpen(false) }}>
              <span className="tt"><b>존 (실)</b><span>선택 · 모서리 리사이즈</span></span><span className="kk">Z</span>
            </button>
            <button className={`figitem${isOutdoor ? ' active' : ''}`} onClick={() => { setMode('outdoor'); setToolMenuOpen(false) }}>
              <span className="tt"><b>실외기</b><span>선택 · 이동 · 삭제</span></span><span className="kk">O</span>
            </button>
            <button className={`figitem${mode === 'pan' ? ' active' : ''}`} onClick={() => { setMode('pan'); setToolMenuOpen(false) }}>
              <span className="tt"><b>손 (이동)</b><span>드래그로 화면 이동</span></span><span className="kk">H</span>
            </button>
          </div>
        )}
      </div>
      {toolMenuOpen && <div className="figmenu-overlay" onClick={() => setToolMenuOpen(false)} />}
      {addMenuOpen && <div className="figmenu-overlay" onClick={() => setAddMenuOpen(false)} />}

      {/* 우상단 플로팅 힌트 위젯 */}
      <div className={`vwidget${hintOpen ? '' : ' collapsed'}`}>
        <div className="vw-head">
          <span>단축키 / 조작</span>
          <button className="vw-btn" onClick={() => setHintOpen((o) => !o)} title={hintOpen ? '접기' : '펼치기'}>{hintOpen ? '−' : '+'}</button>
        </div>
        <div className="vw-body">
          {SHORTCUTS.map((s) => (
            <div className="vw-row" key={s.key}>
              <kbd>{s.key}</kbd>
              <span>{s.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="zoom">
        <button onClick={() => zoomButton(1 / 1.1)} title="확대">+</button>
        <button onClick={() => zoomButton(1.1)} title="축소">−</button>
        <button onClick={() => setView(FIT)} title="맞춤">⤢</button>
        <div className="zoom-pct">{zoomPct}%</div>
      </div>
    </div>
  )
})

export default Viewer

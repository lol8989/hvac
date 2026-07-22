import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import type { ReactElement } from 'react'
import type { Room } from '../data'
import ACUnit from './viewer/ACUnit'
import ODUnit from './viewer/ODUnit'
import ZoneRect from './viewer/ZoneRect'
import { GRID, snap, norm, zoneBounds, zoneAreaM2, zonesBounds } from './viewer/geometry'
import type { UnitSym, ZoneBox, Corner, Pt } from './viewer/geometry'
import type { GroupColor } from '../presentation/generation/groupColors'
import { useDraftCommit } from './viewer/useDraftCommit'
import { usePanZoom, type ViewBox } from './viewer/usePanZoom'
import { useCassetteSelectionSync } from './viewer/useCassetteSelectionSync'
import { useSliceMode } from './viewer/useSliceMode'
import { useMergeMode } from './viewer/useMergeMode'
import { useViewerDrag } from './viewer/useViewerDrag'

export type Mode = 'cassette' | 'zone' | 'pan' | 'outdoor' | 'slice' | 'merge' // 에어컨 / 존 / 손 / 실외기 / 자르기 / 병합

// 자르기 라인(무한 직선): 지나는 점 + 각도(도). 도메인 CutLine과 같은 모양이다.
export interface SliceLine { x: number; y: number; angleDeg: number }

// 도면 폭에 맞는 '딱 떨어지는' 격자 실치수(1·2·5·10 계열, ~100칸 목표). 대형 mm 좌표계용.
const niceGrid = (w: number): number => {
  const target = w / 100
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  return [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= target) ?? 10 * pow
}

// 단축키 도움말(플로팅 위젯) — 단축키 하나당 한 행.
const SHORTCUTS: readonly { key: string; desc: string }[] = [
  { key: 'C', desc: '에어컨(실내기) 모드' },
  { key: 'Z', desc: '존(실) 모드' },
  { key: 'V', desc: '실 자르기 모드' },
  { key: 'M', desc: '실 병합 모드 (붙어 있는 두 실)' },
  { key: 'O', desc: '실외기 모드' },
  { key: 'H', desc: '손(화면 이동) 모드' },
  { key: 'Space', desc: '누르는 동안 화면 이동' },
  { key: '휠', desc: '확대 / 축소' },
  { key: '0', desc: '화면 맞춤' },
  { key: '드래그', desc: '이동 / 영역 선택' },
  { key: 'Shift', desc: '선택 추가' },
  { key: 'R', desc: '에어컨: 90° 회전 / 자르기: 라인 15° 회전' },
  { key: '⟳', desc: '회전 핸들 15°' },
  { key: 'Del', desc: '실내기 삭제' },
  { key: 'Esc', desc: '선택 해제' },
]

// 레이어 표시: 각 레이어를 독립적으로 켜고 끈다(도면 배경은 항상 표시).
// 예전엔 하나만 고르는 단일 필터('all' | 하나)였는데, 여러 레이어를 동시에 보며
// 작업하려면 레이어별 on/off가 맞다 — 그래서 레이어별 boolean 맵으로 바꿨다.
export type LayerName = 'zone' | 'indoor' | 'outdoor'
export type LayerVisibility = Record<LayerName, boolean>
export const ALL_LAYERS_ON: LayerVisibility = { zone: true, indoor: true, outdoor: true }
export const LAYER_TOGGLES: readonly { name: LayerName; label: string }[] = [
  { name: 'indoor', label: '실내기' },
  { name: 'outdoor', label: '실외기' },
  { name: 'zone', label: '실 경계' },
]

// 실외기 배치용 그룹 요약(도면 심볼 라벨·모델·마력).
// 실외기는 장비번호를 쓰지 않는다 — 도면 표기는 **마력(HP)** 이다(0708 회의록 「장비번호기입」,
// 주인님 확인 2026-07-20). 마력은 카탈로그 스펙에서 오므로 표시 계층에서 조인한다.
export interface OutdoorGroupInfo {
  key: string
  label: string
  model: string
  hp?: number
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

// 실내기 심볼 이동/회전 커밋 페이로드(드래그 끝에 한 번만 올린다).
export interface UnitMove { id: string; x: number; y: number }
export interface UnitRotate { id: string; rot: number }

interface ViewerProps {
  rooms: Record<string, Room>
  selectedIds: string[] // 선택된 실(존) id — ModelPanel 연동
  onSelectionChange: (ids: string[]) => void
  onEscape?: () => void
  tiles?: TileManifest // 딥줌 타일 매니페스트(보이는 타일만 로드)
  tileBase?: string // 타일 URL 베이스(예: /tiles)
  // 실내기 심볼은 App(Placement)이 소유한다. 심볼 하나 = 실내기 한 대 = 선정표 대수 1.
  indoorSymbols: UnitSym[]
  onUnitsMove?: (moves: UnitMove[]) => void
  onUnitsRotate?: (rots: UnitRotate[]) => void
  onUnitsDelete?: (ids: string[]) => void
  onUnitAdd?: (roomId: string) => void // 대표 실에 1대 추가
  onAddUnitUnavailable?: (reason: 'step' | 'noRoom') => void // ＋실내기를 못 쓰는 상황 안내(버튼은 항상 활성)
  indoorInfo?: Record<string, { model: string; kind: string }> // 실별 실내기 모델명·유형(심볼 오버레이)
  roomColors?: Record<string, GroupColor> // 실 id → 실외기 그룹 색상(방·실내기 하이라이팅). 미배정 실은 없음 → 무채색
  outdoorGroups?: OutdoorGroupInfo[] // 실외기 배치 대상 그룹(placeOutdoors)
  // 실외기 심볼도 App이 소유한다 — 가드가 '몇 대 중 몇 대 배치됐는지' 알아야 하고,
  // 그 좌표가 산출 도면에 실린다.
  outdoorSymbols: UnitSym[]
  onOutdoorsMove?: (moves: UnitMove[]) => void
  onOutdoorsDelete?: (keys: string[]) => void
  onOutdoorsAutoPlace?: (positions: Record<string, { x: number; y: number }>) => void
  planW?: number // 도면 정규화 좌표 폭(기본 720 목업 / 실도면은 종횡비 유지 폭)
  planH?: number // 도면 정규화 좌표 높이(기본 470)
  mmPerUnit?: number // 정규화 1단위 = 실 mm (격자 실치수 표기 + DXF 왕복)
  fitBounds?: ViewBox // 층 전환: 활성 층 실들을 감싸는 bbox. 있으면 여기에 맞춘다(없으면 전체 도면)
  layers?: LayerVisibility // 레이어별 표시 여부(기본 전부 ON)
  onLayersChange?: (v: LayerVisibility) => void // 레이어 토글은 뷰어 도구다(상단 툴바 밴드 제거)
  canAddUnit?: boolean // ＋실내기 수동 추가 허용 — AI 실내기 배치 완료 전에는 비활성
  canPlaceOutdoors?: boolean // ＋실외기 배치 허용 — '실외기 배치' 단계에서만 활성
  // 실 자르기(V): 실내기 배치 단계에서만 허용한다(실_슬라이싱_설계_v1 §D2).
  canSliceRooms?: boolean
  onRoomSlice?: (roomId: string, line: SliceLine) => void
  onSliceUnavailable?: () => void // 허용되지 않는 단계에서 V를 눌렀을 때(App이 안내한다)
  onZoneResize?: (roomId: string, points: readonly Pt[]) => void // 모서리 리사이즈 커밋(형상 SSOT는 App)
  // 실 병합(M): 붙어 있는 두 실을 하나로. 자르기와 같은 단계(검출)에서만 쓴다.
  canMergeRooms?: boolean
  onRoomsMerge?: (aId: string, bId: string) => void
  isAdjacent?: (aId: string, bId: string) => boolean // 인접 판정은 도메인이 한다(뷰어는 물어본다)
  onMergeUnavailable?: () => void
  // 편집 히스토리 — 되돌리기 대상은 대부분 도면 편집이라 컨트롤도 캔버스에 둔다.
  // 히스토리 자체(스택)는 App이 갖는다. 뷰어는 상태를 표시하고 클릭을 전달할 뿐이다.
  history?: HistoryControl
  // 조합 단계: 선택된 실들 위에 뜨는 '실외기 선정' 오버레이 버튼의 동작(없으면 버튼 미표시).
  onSelectOutdoorForSelection?: () => void
}

export interface HistoryControl {
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string | null // 되돌릴 편집 이름(툴팁) — 없으면 되돌릴 것이 없다
  redoLabel?: string | null
  onUndo: () => void
  onRedo: () => void
}

// App 버튼에서 호출하는 명령형 핸들.
export interface ViewerHandle {
  placeOutdoors: () => void // 그룹별 실외기 심볼을 도면 하단(건물 외부)에 배치
  captureSvg: () => string | null // 현재 도면 SVG 직렬화(캡처 다운로드용)
}

/**
 * SVG 도면 뷰어(편집). 모드: 에어컨(C)=실내기 이동/회전/삭제, 존(Z)=실 선택/모서리 리사이즈, 손(H)=팬.
 * 휠=커서 기준 줌, Space/손=팬, 드래그=영역 다중선택(마퀴). 뷰어 로컬 상태(POC).
 * 좌표계는 planW×planH(목업 720×470 또는 실도면 DXF 월드 mm) 기준.
 */
const Viewer = forwardRef<ViewerHandle, ViewerProps>(function Viewer(
  {
    rooms, selectedIds, onSelectionChange, onEscape, tiles, tileBase,
    indoorSymbols, onUnitsMove, onUnitsRotate, onUnitsDelete, onUnitAdd, onAddUnitUnavailable,
    outdoorSymbols, onOutdoorsMove, onOutdoorsDelete, onOutdoorsAutoPlace,
    indoorInfo, roomColors, outdoorGroups, planW, planH, mmPerUnit, fitBounds, layers = ALL_LAYERS_ON, onLayersChange,
    canAddUnit = true, canPlaceOutdoors = false,
    canSliceRooms = false, onRoomSlice, onSliceUnavailable, onZoneResize,
    canMergeRooms = false, onRoomsMerge, isAdjacent, onMergeUnavailable,
    history, onSelectOutdoorForSelection,
  }: ViewerProps,
  ref,
) {
  // 도면 좌표계 상수(프롭 기반). 실도면(대형 mm)이면 패딩·격자 간격을 비례 조정.
  const PLAN_W = planW ?? 720
  const PLAN_H = planH ?? 470
  // 격자 표시 간격: 실도면이면 딱 떨어지는 실치수(예: 2m)를 정규화 단위로 환산, 목업이면 기존 GRID.
  const gridMm = mmPerUnit ? niceGrid(PLAN_W * mmPerUnit) : null // 격자 1칸의 실 치수(mm)
  const gridStep = gridMm ? gridMm / (mmPerUnit as number) : GRID
  const gridLabel = gridMm ? (gridMm >= 1000 ? `${gridMm / 1000}m` : `${gridMm}mm`) : null
  const [mode, setMode] = useState<Mode>('cassette')
  // 실내기 심볼은 App(Placement)이 소유한다. 드래그·회전 중에는 여기 draft로 그리고,
  // 마우스를 뗄 때 한 번만 커밋한다(60fps마다 App을 리렌더하지 않기 위함).
  const unitDraft = useDraftCommit<Record<string, { x?: number; y?: number; rot?: number }>>()
  const symbols = useMemo(
    () => (unitDraft.value ? indoorSymbols.map((s) => (unitDraft.value![s.id] ? { ...s, ...unitDraft.value![s.id] } : s)) : indoorSymbols),
    [indoorSymbols, unitDraft.value],
  )
  // 실(존)의 형상은 App(roomGeom)이 소유한다 — 검출·자르기 결과가 그대로 내려오고,
  // 뷰어의 모서리 리사이즈는 드래그 중에만 로컬 draft로 그린 뒤 마우스를 뗄 때 한 번 올린다.
  // (실내기 심볼과 같은 controlled 패턴. 뷰어가 형상을 쥐고 있으면 App이 자르는 도형과
  //  사용자가 보는 도형이 어긋난다.)
  const zoneDraft = useDraftCommit<{ id: string; points: Pt[] }>()
  const zones = useMemo<ZoneBox[]>(
    () =>
      Object.entries(rooms).map(([id, r]) => ({
        id,
        name: r.name,
        points: zoneDraft.value && zoneDraft.value.id === id ? zoneDraft.value.points : r.points,
      })),
    [rooms, zoneDraft.value],
  )
  // 에어컨 모드 선택 양방향 동기(심볼↔실). 핑퐁 방지 refs·두 이펙트를 훅으로 뺀다.
  const { selUnits, setSelUnits } = useCassetteSelectionSync({ mode, symbols, zones, selectedIds, onSelectionChange })
  // 실외기 심볼도 controlled. 드래그 중에는 oduDraft로 그리고 마우스를 뗄 때 커밋한다.
  const oduDraft = useDraftCommit<{ id: string; x: number; y: number }>()
  const outdoors = useMemo(
    () => (oduDraft.value ? outdoorSymbols.map((u) => (u.id === oduDraft.value!.id ? { ...u, x: oduDraft.value!.x, y: oduDraft.value!.y } : u)) : outdoorSymbols),
    [outdoorSymbols, oduDraft.value],
  )
  const [selOdu, setSelOdu] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [rotatingId, setRotatingId] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [marquee, setMarquee] = useState<ViewBox | null>(null)
  const [snapOn, setSnapOn] = useState(true)
  const [hintOpen, setHintOpen] = useState(false) // 도면이 주인공 — 단축키 목록은 필요할 때 펼친다
  const [toolMenuOpen, setToolMenuOpen] = useState(false)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // 뷰포트 변환(팬·줌·화면맞춤) — view가 SSOT. 팬 드래그는 아래 멀티플렉서가 setView로 직접 옮긴다.
  const { view, setView, svgW, zoomPct, toSvg, zoomBy, resetView } = usePanZoom({ svgRef, planW: PLAN_W, planH: PLAN_H, fitBounds })
  // 선택된 실들 위에 뜨는 '실외기 선정' 오버레이 버튼의 화면 위치(px, .viewer 기준). 없으면 미표시.
  const [selBtnPos, setSelBtnPos] = useState<{ x: number; y: number } | null>(null)
  const spaceRef = useRef(false)

  // window 리스너(1회 등록)에서 읽는 콜백. 렌더마다 갱신되는 prop을 stale closure 없이 쓴다.
  // draft 값들은 useDraftCommit이 ref로 노출한다(unitDraft.ref 등).
  const cbRef = useRef({ onUnitsMove, onUnitsRotate, onUnitsDelete, onOutdoorsMove, onOutdoorsDelete, onZoneResize })
  cbRef.current = { onUnitsMove, onUnitsRotate, onUnitsDelete, onOutdoorsMove, onOutdoorsDelete, onZoneResize }

  // 실외기 자동 배치: 건물 외부(도면 하단)에 그룹당 하나씩 가로로 나열(폭에 비례 배치).
  // 좌표는 App이 소유하므로 결과를 콜백으로 올린다(재호출 시 기본 배치로 리셋).
  const placeOutdoorsFn = useCallback(() => {
    const gs = outdoorGroups ?? []
    const positions: Record<string, { x: number; y: number }> = {}
    gs.forEach((g, i) => {
      positions[g.key] = { x: snap(PLAN_W * 0.12 + i * PLAN_W * 0.16), y: snap(PLAN_H + PLAN_H * 0.04) }
    })
    onOutdoorsAutoPlace?.(positions)
    setMode('outdoor')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outdoorGroups, PLAN_W, PLAN_H])

  // 명령형 핸들: 실외기 자동 배치(재호출 시 기본 배치로 리셋) + 화면 캡처.
  // 실내기 배치는 명령형 핸들이 아니다 — App이 Placement를 만들면 심볼이 따라온다.
  useImperativeHandle(ref, () => ({
    placeOutdoors: placeOutdoorsFn,
    captureSvg: () => (svgRef.current ? new XMLSerializer().serializeToString(svgRef.current) : null),
  }), [placeOutdoorsFn])

  // window 리스너(1회 등록)에서 읽는 최신 상태 스냅샷. 렌더 중이 아닌 effect에서 갱신(refs 규칙 준수).
  // layers도 싣는다 — 숨긴 레이어의 객체를 마퀴로 잡거나 Del로 지울 수 없어야 한다(적대적 QA).
  const st = useRef({ mode, symbols, zones, selUnits, selectedIds, snapOn, selOdu, layers })
  useEffect(() => { st.current = { mode, symbols, zones, selUnits, selectedIds, snapOn, selOdu, layers } })
  const layerVisible = (name: LayerName, v: LayerVisibility): boolean => v[name]

  // 실 자르기(V) 모드 — 각도·커서·프리뷰·진입 게이트·커밋을 훅으로. 클릭/이동/R은 공유 핸들러가 호출한다.
  const slice = useSliceMode({
    mode, setMode, zones, canSliceRooms, snapOn, gridStep, zoneLayerVisible: layers.zone, view,
    onSliceUnavailable, onRoomSlice,
  })
  const { isSlice, sliceAngle, sliceCursor, slicePreview } = slice
  // 실 병합(M) 모드 — 자르기와 형제. 클릭/이동은 공유 핸들러가 호출한다.
  const merge = useMergeMode({
    mode, setMode, zones, canMergeRooms, zoneLayerVisible: layers.zone,
    isAdjacent, onMergeUnavailable, onRoomsMerge,
  })
  const { isMerge, mergePreview } = merge

  // '실외기 선정' 오버레이 버튼 위치: 선택된 실들의 bbox 상단 중앙을 화면 px로 변환한다.
  // view(팬·줌)·크기·선택이 바뀔 때마다 다시 계산해 선택 위를 따라다닌다.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const wrap = wrapRef.current
    if (!onSelectOutdoorForSelection || !svg || !wrap || selectedIds.length === 0) { setSelBtnPos(null); return }
    const picked = zones.filter((z) => selectedIds.includes(z.id))
    const bb = zonesBounds(picked)
    if (!bb) { setSelBtnPos(null); return }
    const ctm = svg.getScreenCTM()
    if (!ctm) { setSelBtnPos(null); return }
    const pt = svg.createSVGPoint()
    pt.x = bb.x + bb.w / 2 // 선택 실 bbox 상단 중앙
    pt.y = bb.y
    const scr = pt.matrixTransform(ctm)
    const wr = wrap.getBoundingClientRect()
    setSelBtnPos({ x: scr.x - wr.left, y: scr.y - wr.top })
  }, [onSelectOutdoorForSelection, selectedIds, zones, view, svgW])


  const panActive = mode === 'pan' || spaceDown

  // 드래그 멀티플렉서 — 6가지 드래그(팬·리사이즈·회전·이동·실외기·마퀴)를 window 리스너로 처리(§5.8).
  // 뷰어의 mousedown 핸들러는 선택을 처리하고 begin*로 드래그를 연다(정책/메커니즘 분리).
  const drag = useViewerDrag({
    st, svgRef, view, toSvg, setView, setMarquee, setPanning, setRotatingId, setSelUnits,
    onSelectionChange, unitDraft, oduDraft, zoneDraft, cbRef,
  })

  // window 키 리스너는 1회만 등록된다 → 최신 함수를 ref로 읽는다(stale closure 방지).
  const enterSliceRef = useRef(slice.enterSlice)
  enterSliceRef.current = slice.enterSlice
  const enterMergeRef = useRef(merge.enterMerge)
  enterMergeRef.current = merge.enterMerge

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
      else if (k === 'v') enterSliceRef.current()
      else if (k === 'm') enterMergeRef.current()
      else if (k === '0') resetView()
      else if (k === 'r') {
        // R은 모드마다 다른 일을 한다. 에어컨: 선택 실내기 90° 회전 / 자르기: 라인 15° 회전.
        if (st.current.mode === 'cassette') {
          e.preventDefault()
          const sel = st.current.selUnits
          if (sel.size) {
            const rots = st.current.symbols
              .filter((s) => sel.has(s.id))
              .map((s) => ({ id: s.id, rot: norm((Math.floor(s.rot / 90) + 1) * 90) }))
            cbRef.current.onUnitsRotate?.(rots)
          }
        } else if (st.current.mode === 'slice') {
          e.preventDefault()
          slice.rotate() // 직선은 180°면 제자리로 돌아온다
        }
      } else if (k === 'delete' || k === 'backspace') {
        // 숨긴 레이어는 지울 수 없다 — 안 보이는 실내기가 사라지면 대수·조합비가 조용히 틀어진다.
        if (st.current.mode === 'cassette' && layerVisible('indoor', st.current.layers)) {
          e.preventDefault()
          const sel = st.current.selUnits
          // 심볼 삭제 = 실내기 대수 감소. 선정표·조합비가 즉시 따라온다.
          if (sel.size) { cbRef.current.onUnitsDelete?.(Array.from(sel)); setSelUnits(new Set()) }
        } else if (st.current.mode === 'outdoor' && layerVisible('outdoor', st.current.layers)) {
          e.preventDefault()
          const id = st.current.selOdu
          // 실외기 심볼 삭제 = 도면에서 뺀 것. 그룹 자체는 남는다(가드가 '미배치'로 잡는다).
          if (id) { cbRef.current.onOutdoorsDelete?.([id]); setSelOdu(null) }
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
  }, [onEscape, onSelectionChange, resetView])

  const onBgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panActive) { drag.startPan(e.clientX, e.clientY); return }
    const p = toSvg(e.clientX, e.clientY); if (!p) return
    // 자르기 모드에서는 존 레이어가 클릭을 받지 않으므로(pointerEvents none) 여기서 히트 판정한다.
    // 마퀴보다 먼저 걸러야 한다 — 안 그러면 자르기 클릭이 영역 선택으로 먹힌다.
    if (mode === 'slice') { slice.commitAt(p); return }
    if (mode === 'merge') { merge.commitAt(p); return }
    drag.beginMarquee(p.x, p.y, e.shiftKey)
  }

  // 자르기 라인 프리뷰: 버튼을 누르지 않은 커서 추적은 window onMove(드래그 전용)가 안 잡는다.
  const onSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (mode !== 'slice' && mode !== 'merge') return
    const p = toSvg(e.clientX, e.clientY)
    if (!p) return
    if (mode === 'slice') slice.trackCursor(p)
    else merge.trackHover(p)
  }

  // 실내기 심볼: 선택 + 이동 시작.
  const onUnitDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { drag.startPan(e.clientX, e.clientY); return }
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
    drag.beginUnitDrag(orig, p)
  }

  const onRotateDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const ids = selUnits.has(id) && selUnits.size > 1 ? Array.from(selUnits) : [id]
    const orig: Record<string, number> = {}
    symbols.forEach((s) => { if (ids.includes(s.id)) orig[s.id] = s.rot })
    drag.beginRotate(orig, e.clientX)
    setRotatingId(id)
  }

  const onZoneDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { drag.startPan(e.clientX, e.clientY); return }
    e.stopPropagation()
    if (e.shiftKey) onSelectionChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])
    else onSelectionChange([id])
  }

  // 실외기 심볼: 선택 + 이동 시작.
  const onODUDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { drag.startPan(e.clientX, e.clientY); return }
    e.stopPropagation()
    setSelOdu(id)
    const p = toSvg(e.clientX, e.clientY); if (!p) return
    const o = outdoors.find((u) => u.id === id); if (!o) return
    drag.beginOduDrag(id, p, o)
  }

  const onCornerDown = (e: React.MouseEvent, id: string, corner: Corner) => {
    e.stopPropagation()
    const z = zones.find((zz) => zz.id === id); if (!z) return
    const b = zoneBounds(z)
    let ax: number, ay: number // 반대편(고정) 모서리
    if (corner === 'tl') { ax = b.x + b.w; ay = b.y + b.h }
    else if (corner === 'tr') { ax = b.x; ay = b.y + b.h }
    else if (corner === 'bl') { ax = b.x + b.w; ay = b.y }
    else { ax = b.x; ay = b.y }
    drag.beginZoneResize(id, corner, { x: ax, y: ay })
    onSelectionChange([id])
  }

  // 선택한 실에 실내기를 한 대 더한다.
  // 예전에는 실과 무관한 '자유 심볼'(IDU_*)을 아무 데나 놓을 수 있었는데,
  // 그 심볼은 어느 실에도 속하지 않아 선정표·일람표에 실리지 않았다. 그래서 실에 귀속시킨다.
  const primaryRoom = selectedIds[0]
  // 버튼은 항상 활성이다(§3 UI 정책) — 못 쓰는 상황이면 죽이지 않고 이유·다음 할 일을 안내한다.
  const addUnitToRoom = () => {
    if (!canAddUnit) { onAddUnitUnavailable?.('step'); return } // 실내기 배치 단계가 아니다
    if (!primaryRoom) {
      // 추가할 실이 없다 → 존(실) 모드로 바꿔 실을 고르게 하고, 그 다음 할 일을 알린다.
      setMode('zone')
      onAddUnitUnavailable?.('noRoom')
      return
    }
    onUnitAdd?.(primaryRoom)
    setMode('cassette')
  }


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
  // isSlice·slicePreview는 useSliceMode, isMerge·mergePreview는 useMergeMode에서 파생
  // 레이어 표시: 켜 둔 레이어만 그리고 편집을 받는다.
  const layerOn = (name: LayerName): boolean => layers[name]
  // '전체' 마스터 토글: 모두 켜짐/모두 꺼짐/일부만(중간)을 반영하고 한 번에 켜거나 끈다.
  const allLayersOn = LAYER_TOGGLES.every((l) => layers[l.name])
  const someLayersOn = LAYER_TOGGLES.some((l) => layers[l.name])
  const setAllLayers = (on: boolean) => onLayersChange?.({ zone: on, indoor: on, outdoor: on })
  const MODE_LABEL: Record<Mode, string> = {
    cassette: '에어컨',
    zone: '존(실)',
    outdoor: '실외기',
    slice: '실 자르기',
    merge: '실 병합',
    pan: '손 (이동)',
  }
  const modeLabel = MODE_LABEL[mode]


  return (
    <div className="viewer" ref={wrapRef}>
      {/* 좌상단 뷰어 도구: 레이어 필터 + 격자. (조작 힌트는 우상단 단축키 위젯에 있다 — 중복 제거) */}
      <div className="vtools">
        {onLayersChange && (
          <div className="vlayers" role="group" aria-label="레이어 표시">
            <span className="vlayers-h">레이어</span>
            <label className="vtoggle vtoggle-all" title={allLayersOn ? '전체 끄기' : '전체 켜기'}>
              <input
                type="checkbox"
                // indeterminate(중간 상태)는 JSX 속성이 없어 DOM에 직접 세팅한다 — 일부만 켜졌을 때.
                ref={(el) => { if (el) el.indeterminate = someLayersOn && !allLayersOn }}
                checked={allLayersOn}
                onChange={() => setAllLayers(!allLayersOn)}
              /> 전체
            </label>
            <span className="vlayers-sep" aria-hidden="true" />
            {LAYER_TOGGLES.map((l) => (
              <label className="vtoggle" key={l.name}>
                <input
                  type="checkbox"
                  checked={layers[l.name]}
                  onChange={(e) => onLayersChange({ ...layers, [l.name]: e.target.checked })}
                /> {l.label}
              </label>
            ))}
          </div>
        )}
        <label className="vtoggle"><input type="checkbox" checked={snapOn} onChange={(e) => setSnapOn(e.target.checked)} /> 격자{gridLabel ? ` (${gridLabel})` : ''}</label>
      </div>
      {/* 도면 영역 상단 가운데: 배치 액션 — ＋실내기(실내기 배치 단계), ＋실외기 배치(실외기 배치 단계) */}
      <div className="vtools vtools-center">
        <button
          className="btn sm"
          onClick={addUnitToRoom}
          title={
            !canAddUnit
              ? "'실내기 배치' 단계에서 실내기를 추가할 수 있습니다"
              : !primaryRoom
                ? '추가할 실을 먼저 선택하세요 — 존(실) 모드(단축키 Z)로 실을 클릭하세요'
                : `${primaryRoom}에 실내기 1대를 추가합니다`
          }
        >＋ 실내기</button>
        <button
          className="btn sm"
          onClick={placeOutdoorsFn}
          disabled={!canPlaceOutdoors}
          title={canPlaceOutdoors ? '조합 그룹별 실외기를 도면 하단(건물 외부)에 배치' : "'실외기 배치' 단계에서 배치할 수 있습니다"}
        >＋ 실외기 배치</button>
      </div>

      <svg
        ref={svgRef}
        className={`plansvg${panActive ? ' panmode' : ''}${panning ? ' panning' : ''}${isSlice && !panActive ? ' slicemode' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onBgDown}
        onMouseMove={onSvgMove}
        onMouseLeave={() => isSlice && slice.clearCursor()}
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

        {/* 실(존) 레이어 — 자르기 모드에서도 또렷하게 보여야 무엇을 자르는지 안다.
            단 클릭은 받지 않는다(배경 핸들러가 히트 판정해 자른다). */}
        <g style={{ pointerEvents: isZone ? 'auto' : 'none', opacity: isZone || isSlice || isMerge ? 1 : 0.85, display: layerOn('zone') ? undefined : 'none' }}>
          {zones.map((z) => {
            // 면적(㎡)은 도메인 값이다 — 화면·선정표·산출 도면이 같은 숫자를 말해야 한다.
            const a = zoneAreaM2(rooms[z.id]?.area)
            return (
              <ZoneRect
                key={z.id} z={z} editing={isZone && selectedIds.includes(z.id)} selected={selectedIds.includes(z.id)}
                areaText={a != null ? `${a.toFixed(1)}㎡` : undefined}
                color={roomColors?.[z.id]}
                onDown={onZoneDown} onCornerDown={onCornerDown}
              />
            )
          })}
        </g>

        {/* 실내기(에어컨) 레이어 */}
        <g style={{ pointerEvents: isCassette ? 'auto' : 'none', opacity: isCassette ? 1 : 0.5, display: layerOn('indoor') ? undefined : 'none' }}>
          {symbols.map((s) => {
            // 심볼의 모델·유형은 그 심볼이 속한 실의 선정 결과에서 온다.
            const info = s.roomId ? indoorInfo?.[s.roomId] : undefined
            return (
              <ACUnit
                key={s.id} sym={s} selected={selUnits.has(s.id)} hovered={hoveredId === s.id} rotating={rotatingId === s.id}
                model={info?.model} kind={info?.kind ?? s.kind}
                accent={s.roomId ? roomColors?.[s.roomId]?.head : undefined}
                onBodyDown={onUnitDown} onRotateDown={onRotateDown}
                onEnter={setHoveredId} onLeave={(id) => setHoveredId((h) => (h === id ? null : h))}
              />
            )
          })}
        </g>

        {/* 실외기 레이어 */}
        <g style={{ pointerEvents: isOutdoor ? 'auto' : 'none', opacity: isOutdoor ? 1 : 0.55, display: layerOn('outdoor') ? undefined : 'none' }}>
          {outdoors.map((u) => {
            const g = outdoorGroups?.find((x) => x.key === u.id)
            return (
              <ODUnit key={u.id} sym={u} selected={selOdu === u.id} label={g?.label ?? u.id} model={g?.model} hp={g?.hp} onDown={onODUDown} />
            )
          })}
        </g>

        {marquee && (marquee.w > 0 || marquee.h > 0) && (
          <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="rgba(34,34,34,0.06)" stroke="#333333" strokeWidth={1} strokeDasharray="4 3" />
        )}

        {/* 병합 프리뷰: 1차 선택 실(굵은 테두리) + 커서 아래 실(붙어 있으면 채움, 아니면 점선) */}
        {mergePreview && (
          <g style={{ pointerEvents: 'none' }} data-testid="merge-preview">
            {mergePreview.first && (
              <polygon
                points={mergePreview.first.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="#222222" fillOpacity={0.12} stroke="#222222" strokeWidth={2} vectorEffect="non-scaling-stroke"
              />
            )}
            {mergePreview.hover && (
              <polygon
                points={mergePreview.hover.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={mergePreview.adjacent ? '#222222' : 'none'}
                fillOpacity={mergePreview.adjacent ? 0.08 : 0}
                stroke={mergePreview.adjacent ? '#222222' : '#999999'}
                strokeWidth={1.5}
                strokeDasharray={mergePreview.adjacent ? undefined : '5 4'}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        )}

        {/* 자르기 라인 — 마우스 포인터를 대신한다(커서는 CSS에서 숨긴다) */}
        {slicePreview && (
          <g style={{ pointerEvents: 'none' }} data-testid="slice-preview">
            {slicePreview.target && (
              <polygon
                points={slicePreview.target.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="#222222" fillOpacity={0.08} stroke="#222222" strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              />
            )}
            <line
              x1={slicePreview.x1} y1={slicePreview.y1} x2={slicePreview.x2} y2={slicePreview.y2}
              stroke="#222222" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"
            />
            <circle cx={sliceCursor!.x} cy={sliceCursor!.y} r={3} fill="#222222" vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>

      {/* 자르기 모드 안내 — 각도를 숫자로 보여준다(R로 15°씩) */}
      {isSlice && (
        <div className="slicehud">실 자르기 · {sliceAngle}° <kbd>R</kbd> 15° 회전 · 실을 클릭하면 잘립니다</div>
      )}
      {/* 병합 모드 안내 */}
      {isMerge && (
        <div className="slicehud">
          {mergePreview?.first
            ? `실 병합 · ${mergePreview.first.name} + ? · 붙어 있는 실을 클릭하세요`
            : '실 병합 · 합칠 두 실을 차례로 클릭하세요'}
          {mergePreview?.first && mergePreview?.hover && !mergePreview.adjacent && <span> · 붙어 있지 않습니다</span>}
        </div>
      )}

      {/* 선택한 실들 위에 뜨는 컨텍스트 액션 — 이 실들로 실외기를 선정(그룹 생성)한다. */}
      {selBtnPos && onSelectOutdoorForSelection && (
        <button
          className="sel-action"
          style={{ left: selBtnPos.x, top: selBtnPos.y }}
          onClick={onSelectOutdoorForSelection}
          title="선택한 실들로 실외기를 선정해 그룹을 만듭니다"
        >
          ＋ 실외기 선정 · {selectedIds.length}개실
        </button>
      )}

      {/* 하단 중앙 도크 — 편집 히스토리(좌) + Figma식 도구바(우) */}
      <div className="figdock">
        {history && (
          <div className="fighist">
            <button
              className="fighist-btn"
              disabled={!history.canUndo}
              onClick={history.onUndo}
              title={history.undoLabel ? `${history.undoLabel} 되돌리기 (Ctrl+Z)` : '되돌릴 편집이 없습니다'}
              aria-label="되돌리기"
            >↶</button>
            <button
              className="fighist-btn"
              disabled={!history.canRedo}
              onClick={history.onRedo}
              title={history.redoLabel ? `${history.redoLabel} 다시 실행 (Ctrl+Shift+Z)` : '다시 실행할 편집이 없습니다'}
              aria-label="다시 실행"
            >↷</button>
          </div>
        )}
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
            <button className={`figitem${isSlice ? ' active' : ''}`} onClick={() => { slice.enterSlice(); setToolMenuOpen(false) }}>
              <span className="tt"><b>실 자르기</b><span>클릭으로 절단 · R 15° 회전</span></span><span className="kk">V</span>
            </button>
            <button className={`figitem${isMerge ? ' active' : ''}`} onClick={() => { merge.enterMerge(); setToolMenuOpen(false) }}>
              <span className="tt"><b>실 병합</b><span>붙어 있는 두 실을 클릭</span></span><span className="kk">M</span>
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
      </div>
      {toolMenuOpen && <div className="figmenu-overlay" onClick={() => setToolMenuOpen(false)} />}

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
        <button onClick={() => zoomBy(1 / 1.1)} title="확대">+</button>
        <button onClick={() => zoomBy(1.1)} title="축소">−</button>
        <button onClick={resetView} title="맞춤">⤢</button>
        <div className="zoom-pct">{zoomPct}%</div>
      </div>
    </div>
  )
})

export default Viewer

import { useRef, useState, useEffect } from 'react'
import type { Room } from '../data'

// SVG 좌표계 기준 도면 크기(목업). 실제 도면 연동 시 도면 bounds로 대체.
const PLAN_W = 720
const PLAN_H = 470
const FIT = { x: -40, y: -30, w: PLAN_W + 80, h: PLAN_H + 60 }
const BASE_W = FIT.w // 줌 100% 기준 폭
const MIN_W = BASE_W / 8 // 최대 확대
const MAX_W = BASE_W * 3 // 최대 축소

type Mode = 'select' | 'pan'

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

interface ViewerProps {
  rooms: Record<string, Room>
  selectedIds: string[]
  placed: boolean
  onSelectionChange: (ids: string[]) => void
  onEscape?: () => void // Esc: 팝업 닫기 등
  drawingSrc?: string
}

const clampW = (nw: number, nh: number): [number, number] => {
  if (nw < MIN_W) { const k = MIN_W / nw; return [nw * k, nh * k] }
  if (nw > MAX_W) { const k = MAX_W / nw; return [nw * k, nh * k] }
  return [nw, nh]
}

/**
 * SVG 도면 뷰어.
 * - 휠: 커서 아래 지점 고정 확대/축소 (getScreenCTM 기반)
 * - 선택 모드: 실 클릭 선택(Shift 토글) · 빈 곳 드래그로 영역 다중선택(마퀴)
 * - 손 모드 / Space+드래그: 화면 이동(팬)
 * - 단축키: V(선택) · H·Space(손) · 0(맞춤) · Esc(선택 해제/팝업)
 * - 하단 중앙 Figma식 도구바 + 우상단 플로팅 힌트 위젯
 */
export default function Viewer({ rooms, selectedIds, placed, onSelectionChange, onEscape, drawingSrc }: ViewerProps) {
  const [view, setView] = useState<ViewBox>(FIT)
  const [mode, setMode] = useState<Mode>('select')
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [marquee, setMarquee] = useState<ViewBox | null>(null)
  const [hintOpen, setHintOpen] = useState(true)
  const [toolMenuOpen, setToolMenuOpen] = useState(false)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; a: number; d: number } | null>(null)
  const marqRef = useRef<{ sx: number; sy: number; additive: boolean } | null>(null)
  const spaceRef = useRef(false)
  const selRef = useRef(selectedIds)
  useEffect(() => { selRef.current = selectedIds }, [selectedIds])

  const zoomPct = Math.round((BASE_W / view.w) * 100)
  const panActive = mode === 'pan' || spaceDown

  // 클라이언트 좌표 → 도면 좌표(라이브 CTM 기준)
  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = cx
    pt.y = cy
    return pt.matrixTransform(ctm.inverse())
  }

  const selectRoom = (id: string, additive: boolean) => {
    if (additive) {
      onSelectionChange(selRef.current.includes(id) ? selRef.current.filter((x) => x !== id) : [...selRef.current, id])
    } else {
      onSelectionChange([id])
    }
  }

  // 휠 확대/축소: 커서 아래 지점 고정. React onWheel은 passive라 네이티브로 등록.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const p = pt.matrixTransform(ctm.inverse())
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      setView((v) => {
        const [nw, nh] = clampW(v.w * factor, v.h * factor)
        const fracX = (p.x - v.x) / v.w
        const fracY = (p.y - v.y) / v.h
        return { x: p.x - fracX * nw, y: p.y - fracY * nh, w: nw, h: nh }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // 팬/마퀴: 드래그가 화면 밖으로 나가도 이어지도록 window 리스너로 처리.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pn = panRef.current
      if (pn) {
        const dx = (e.clientX - pn.sx) / pn.a
        const dy = (e.clientY - pn.sy) / pn.d
        setView((v) => ({ ...v, x: pn.vx - dx, y: pn.vy - dy }))
        return
      }
      const mq = marqRef.current
      if (mq) {
        const p = toSvg(e.clientX, e.clientY)
        if (!p) return
        setMarquee({ x: Math.min(mq.sx, p.x), y: Math.min(mq.sy, p.y), w: Math.abs(p.x - mq.sx), h: Math.abs(p.y - mq.sy) })
      }
    }
    const onUp = () => {
      if (panRef.current) {
        panRef.current = null
        setPanning(false)
        return
      }
      const mq = marqRef.current
      if (mq) {
        setMarquee((rect) => {
          if (rect) {
            const big = rect.w > 3 || rect.h > 3
            if (big) {
              const hits = Object.entries(rooms)
                .filter(([, r]) => !(r.x > rect.x + rect.w || r.x + r.w < rect.x || r.y > rect.y + rect.h || r.y + r.h < rect.y))
                .map(([id]) => id)
              const base = mq.additive ? selRef.current : []
              onSelectionChange(Array.from(new Set([...base, ...hits])))
            } else if (!mq.additive) {
              onSelectionChange([]) // 빈 곳 클릭 → 선택 해제
            }
          }
          return null
        })
        marqRef.current = null
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [rooms, onSelectionChange])

  // 단축키: V(선택) · H/Space(손) · 0(맞춤) · Esc(해제/팝업). 입력 중에는 무시.
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    }
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!spaceRef.current) { spaceRef.current = true; setSpaceDown(true) }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'v') setMode('select')
      else if (k === 'h') setMode('pan')
      else if (k === '0') setView(FIT)
      else if (k === 'escape') { onSelectionChange([]); setToolMenuOpen(false); onEscape?.() }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') { spaceRef.current = false; setSpaceDown(false) }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [onEscape, onSelectionChange])

  const startPan = (cx: number, cy: number) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return
    panRef.current = { sx: cx, sy: cy, vx: view.x, vy: view.y, a: ctm.a, d: ctm.d }
    setPanning(true)
  }

  // 배경(빈 곳) 마우스다운: 손 모드/Space면 팬, 아니면 마퀴 시작.
  const onBgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panActive) { startPan(e.clientX, e.clientY); return }
    const p = toSvg(e.clientX, e.clientY)
    if (!p) return
    marqRef.current = { sx: p.x, sy: p.y, additive: e.shiftKey }
    setMarquee({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  // 실 마우스다운: 손 모드/Space면 팬, 아니면 선택(Shift 토글).
  const onRoomDown = (e: React.MouseEvent, id: string) => {
    if (panActive) { startPan(e.clientX, e.clientY); return }
    e.stopPropagation()
    selectRoom(id, e.shiftKey)
  }

  const zoomButton = (factor: number) =>
    setView((v) => {
      const [nw, nh] = clampW(v.w * factor, v.h * factor)
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh }
    })

  return (
    <div className="viewer">
      <div className="vhint">[도면 뷰어 — 휠: 확대/축소 · 드래그: 영역선택 · Space/손: 이동 · 0: 맞춤]</div>
      <svg
        ref={svgRef}
        className={`plansvg${panActive ? ' panmode' : ''}${panning ? ' panning' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={onBgDown}
      >
        <g className="drawing-layer">
          <rect x="0" y="0" width={PLAN_W} height={PLAN_H} fill="#ffffff" stroke="#CFCFCF" />
          {drawingSrc ? (
            <image href={drawingSrc} x="0" y="0" width={PLAN_W} height={PLAN_H} />
          ) : (
            <text x={PLAN_W / 2} y={PLAN_H - 14} fontSize="10" textAnchor="middle" fill="#c8c8c8">
              도면 레이어 (DXF/SVG/이미지 마운트 지점)
            </text>
          )}
        </g>

        {/* === 실 검출 오버레이 레이어 === */}
        <g className="room-layer">
          {Object.entries(rooms).map(([id, r]) => {
            const on = selectedIds.includes(id)
            return (
              <g key={id} onMouseDown={(e) => onRoomDown(e, id)} style={{ cursor: panActive ? 'grab' : 'pointer' }}>
                <rect
                  x={r.x} y={r.y} width={r.w} height={r.h}
                  fill={on ? '#EDEDED' : placed ? '#F1F1F1' : '#FCFCFC'}
                  fillOpacity="0.85"
                  stroke={on ? '#222222' : placed ? '#333333' : '#C9C9C9'}
                  strokeWidth={on ? 2 : 1}
                />
                <text x={r.x + 8} y={r.y + 15} fontSize="10" fill="#999">{r.name}</text>
                <text x={r.x + r.w - 8} y={r.y + 15} fontSize="9" fill="#aaa" textAnchor="end">{id}</text>
                <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 4} fontSize="11" textAnchor="middle" fill="#222">
                  실내기 {r.type}
                </text>
              </g>
            )
          })}
        </g>

        {marquee && (marquee.w > 0 || marquee.h > 0) && (
          <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
                fill="rgba(34,34,34,0.06)" stroke="#333333" strokeWidth={1} strokeDasharray="4 3" />
        )}
      </svg>

      {/* 하단 중앙 Figma식 도구바 */}
      <div className="figbar">
        <button className="figtool" onClick={() => setToolMenuOpen((o) => !o)} title="도구 선택">
          <span className="figtool-name">{mode === 'select' ? '선택' : '손 (이동)'}</span>
          <span className="figtool-chev">▾</span>
        </button>
        {toolMenuOpen && (
          <div className="figmenu">
            <button className={`figitem${mode === 'select' ? ' active' : ''}`} onClick={() => { setMode('select'); setToolMenuOpen(false) }}>
              <span className="tt"><b>선택</b><span>실 클릭 · 영역 다중선택</span></span>
              <span className="kk">V</span>
            </button>
            <button className={`figitem${mode === 'pan' ? ' active' : ''}`} onClick={() => { setMode('pan'); setToolMenuOpen(false) }}>
              <span className="tt"><b>손 (이동)</b><span>드래그로 화면 이동</span></span>
              <span className="kk">H</span>
            </button>
          </div>
        )}
      </div>
      {toolMenuOpen && <div className="figmenu-overlay" onClick={() => setToolMenuOpen(false)} />}

      {/* 우상단 플로팅 위젯 — 단축키 힌트(접기/펼치기) */}
      <div className={`vwidget${hintOpen ? '' : ' collapsed'}`}>
        <div className="vw-head">
          <span>단축키 / 조작</span>
          <button className="vw-btn" onClick={() => setHintOpen((o) => !o)} title={hintOpen ? '접기' : '펼치기'}>
            {hintOpen ? '−' : '+'}
          </button>
        </div>
        <div className="vw-body">
          <div className="vw-row"><kbd>휠</kbd> 확대/축소 (커서 기준)</div>
          <div className="vw-row"><kbd>드래그</kbd> 영역 다중선택</div>
          <div className="vw-row"><kbd>Shift</kbd>+클릭 선택 추가/해제</div>
          <div className="vw-row"><kbd>Space</kbd>·<kbd>H</kbd> 화면 이동(손)</div>
          <div className="vw-row"><kbd>V</kbd> 선택 도구</div>
          <div className="vw-row"><kbd>0</kbd> 맞춤(100%) 리셋</div>
          <div className="vw-row"><kbd>Esc</kbd> 선택 해제 / 팝업</div>
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
}

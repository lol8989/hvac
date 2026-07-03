import { useRef, useState, useEffect } from 'react'
import type { Room } from '../data'

// SVG 좌표계 기준 도면 크기(목업). 실제 도면 연동 시 도면 bounds로 대체.
const PLAN_W = 720
const PLAN_H = 470
const FIT = { x: -40, y: -30, w: PLAN_W + 80, h: PLAN_H + 60 }
const BASE_W = FIT.w // 줌 100% 기준 폭
const MIN_W = BASE_W / 8 // 최대 확대
const MAX_W = BASE_W * 3 // 최대 축소

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

interface ViewerProps {
  rooms: Record<string, Room>
  selRoom: string
  placed: boolean
  onPick: (id: string) => void
  onEscape?: () => void // Esc: 모달 닫기 등
  drawingSrc?: string
}

/**
 * SVG 도면 뷰어.
 * - 휠: 커서 아래 지점 고정 확대/축소 (getScreenCTM 기반)
 * - 드래그 / Space+드래그: 화면 이동(팬) — CTM 스케일로 정확 변환
 * - 단축키: Space(팬) · 0(맞춤 리셋) · Esc(모달 닫기)
 * - 우상단 플로팅 위젯: 단축키 힌트(접기/펼치기)
 */
export default function Viewer({ rooms, selRoom, placed, onPick, onEscape, drawingSrc }: ViewerProps) {
  const [view, setView] = useState<ViewBox>(FIT)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [hintOpen, setHintOpen] = useState(true)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number; a: number; d: number } | null>(null)
  const movedRef = useRef(false)
  const spaceRef = useRef(false)

  const zoomPct = Math.round((BASE_W / view.w) * 100)

  // 휠 확대/축소: 커서 아래 지점을 고정한 채 스케일. React onWheel은 passive라 네이티브로 등록.
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
      const p = pt.matrixTransform(ctm.inverse()) // 커서의 도면 좌표(라이브 CTM 기준)
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      setView((v) => {
        let nw = v.w * factor
        let nh = v.h * factor
        if (nw < MIN_W) { const k = MIN_W / nw; nw *= k; nh *= k }
        if (nw > MAX_W) { const k = MAX_W / nw; nw *= k; nh *= k }
        const fracX = (p.x - v.x) / v.w
        const fracY = (p.y - v.y) / v.h
        return { x: p.x - fracX * nw, y: p.y - fracY * nh, w: nw, h: nh }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  // 팬: 드래그 중 화면 밖으로 나가도 이어지도록 window 리스너로 처리.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const pn = panRef.current
      if (!pn) return
      const dx = (e.clientX - pn.sx) / pn.a
      const dy = (e.clientY - pn.sy) / pn.d
      if (Math.abs(e.clientX - pn.sx) > 3 || Math.abs(e.clientY - pn.sy) > 3) movedRef.current = true
      setView((v) => ({ ...v, x: pn.vx - dx, y: pn.vy - dy }))
    }
    const onUp = () => {
      if (panRef.current) {
        panRef.current = null
        setPanning(false)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // 단축키: Space(팬 커서) · 0(맞춤) · Esc(모달 닫기). 입력 중에는 무시.
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
      } else if (e.key === '0') {
        setView(FIT)
      } else if (e.key === 'Escape') {
        onEscape?.()
      }
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
  }, [onEscape])

  const startPan = (e: React.MouseEvent<SVGSVGElement>) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return
    panRef.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, a: ctm.a, d: ctm.d }
    movedRef.current = false
    setPanning(true)
  }

  const zoomButton = (factor: number) =>
    setView((v) => {
      let nw = v.w * factor
      let nh = v.h * factor
      if (nw < MIN_W) { const k = MIN_W / nw; nw *= k; nh *= k }
      if (nw > MAX_W) { const k = MAX_W / nw; nw *= k; nh *= k }
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh }
    })

  return (
    <div className="viewer">
      <div className="vhint">[도면 뷰어 — 휠: 확대/축소(커서 기준) · 드래그/Space: 이동 · 0: 맞춤]</div>
      <svg
        ref={svgRef}
        className={`plansvg${spaceDown ? ' panmode' : ''}${panning ? ' panning' : ''}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={startPan}
      >
        {/* === 실제 도면 레이어 (연동 지점) === */}
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
            const on = id === selRoom
            return (
              <g
                key={id}
                onClick={() => { if (!movedRef.current) onPick(id) }}
                style={{ cursor: spaceDown ? 'grab' : 'pointer' }}
              >
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
      </svg>

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
          <div className="vw-row"><kbd>드래그</kbd> 화면 이동</div>
          <div className="vw-row"><kbd>Space</kbd>+드래그 화면 이동</div>
          <div className="vw-row"><kbd>0</kbd> 맞춤(100%) 리셋</div>
          <div className="vw-row"><kbd>Esc</kbd> 팝업 닫기</div>
          <div className="vw-row"><kbd>클릭</kbd> 실 선택</div>
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

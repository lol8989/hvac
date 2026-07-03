import { useRef, useState, useEffect } from 'react'

// SVG 좌표계 기준 도면 크기(목업). 실제 도면 연동 시 도면 bounds로 대체.
const PLAN_W = 720
const PLAN_H = 470
const FIT = { x: -40, y: -30, w: PLAN_W + 80, h: PLAN_H + 60 }

/**
 * SVG 도면 뷰어 스켈레톤.
 * - viewBox 기반 확대/축소(휠, +/- 버튼) · 드래그 이동(pan) · 맞춤(fit)
 * - drawing-layer: 실제 도면 마운트 지점 (DXF 파싱 결과 <path>/<g>, 또는 <image href={drawingSrc}>)
 * - room-layer: 방 검출 결과 오버레이(클릭 선택). props 인터페이스는 기존과 동일.
 */
export default function Viewer({ rooms, selRoom, placed, onPick, drawingSrc }) {
  const [view, setView] = useState(FIT)
  const drag = useRef(null)
  const svgRef = useRef(null)

  const zoomAt = (factor) =>
    setView((v) => {
      const nw = v.w * factor
      const nh = v.h * factor
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh }
    })

  // 휠 확대/축소: React의 onWheel은 passive 리스너라 preventDefault가 무시된다.
  // → 네이티브 wheel 리스너를 { passive: false }로 직접 등록해 브라우저 스크롤을 막는다.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = (e) => {
      e.preventDefault()
      zoomAt(e.deltaY > 0 ? 1.1 : 0.9)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const onDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }
  }
  const onMove = (e) => {
    if (!drag.current) return
    const scale = view.w / e.currentTarget.clientWidth
    setView((v) => ({
      ...v,
      x: drag.current.ox - (e.clientX - drag.current.sx) * scale,
      y: drag.current.oy - (e.clientY - drag.current.sy) * scale,
    }))
  }
  const onUp = () => {
    drag.current = null
  }

  return (
    <div className="viewer">
      <div className="vhint">[도면 뷰어 — SVG · 휠: 확대/축소 · 드래그: 이동]</div>
      <svg
        ref={svgRef}
        className="plansvg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
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

        {/* === 방 검출 오버레이 레이어 === */}
        <g className="room-layer">
          {Object.entries(rooms).map(([id, r]) => {
            const on = id === selRoom
            return (
              <g key={id} onClick={() => onPick(id)} style={{ cursor: 'pointer' }}>
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

      <div className="zoom">
        <button onClick={() => zoomAt(0.9)} title="확대">+</button>
        <button onClick={() => zoomAt(1.1)} title="축소">−</button>
        <button onClick={() => setView(FIT)} title="맞춤">⤢</button>
      </div>
    </div>
  )
}

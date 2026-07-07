// 실내기(에어컨) 심볼 — 프레젠테이션 전용(무채색). 이동은 본체 드래그, 회전은 상단 핸들.
import type { UnitSym } from './geometry'

interface ACUnitProps {
  sym: UnitSym
  selected: boolean
  hovered: boolean
  rotating: boolean
  model?: string // 배정/추천 실내기 모델명(오버레이). 자유 심볼은 없음
  kind?: string // 실내기 유형(벽걸이형 / 4WAY)
  onBodyDown: (e: React.MouseEvent, id: string) => void
  onRotateDown: (e: React.MouseEvent, id: string) => void
  onEnter: (id: string) => void
  onLeave: (id: string) => void
}

const GRILLE = [-8, -3, 2, 7]

export default function ACUnit({ sym, selected, hovered, rotating, model, kind, onBodyDown, onRotateDown, onEnter, onLeave }: ACUnitProps) {
  const showHandle = hovered || rotating
  const topLabel = kind ? `${kind} · ${sym.id}` : sym.id
  return (
    <g
      transform={`translate(${sym.x}, ${sym.y})`}
      data-unit-id={sym.id}
      data-selected={selected ? 'true' : undefined}
      onMouseEnter={() => onEnter(sym.id)}
      onMouseLeave={() => onLeave(sym.id)}
    >
      <g transform={`rotate(${sym.rot})`} onMouseDown={(e) => onBodyDown(e, sym.id)} style={{ cursor: 'move' }}>
        {selected && (
          <rect x={-44} y={-26} width={88} height={70} rx={7} fill="rgba(34,34,34,0.05)" stroke="#222222" strokeWidth={1.2} strokeDasharray="5 4" />
        )}
        <rect x={-40} y={-18} width={80} height={36} rx={7} fill="#F2F2F2" stroke="#888888" strokeWidth={1.3} />
        <rect x={-40} y={-18} width={80} height={9} rx={7} fill="#DDDDDD" />
        {GRILLE.map((gy, i) => (
          <line key={i} x1={-33} y1={gy} x2={33} y2={gy} stroke="#BBBBBB" strokeWidth={1.3} strokeLinecap="round" />
        ))}
        <rect x={-36} y={13} width={72} height={5} rx={2.5} fill="#555555" />
        <g stroke="#333333" strokeWidth={2} strokeLinecap="round" fill="none" opacity={selected ? 1 : 0.5}>
          <line x1={0} y1={22} x2={0} y2={40} />
          <polyline points="-6,33 0,41 6,33" />
        </g>
      </g>

      {/* 라벨은 회전 그룹 밖(항상 수평). 상단: 유형 · 식별자, 하단: 모델명 오버레이 */}
      <text x={0} y={-22} textAnchor="middle" fontSize={8} fontWeight="700"
        fill={selected ? '#222222' : '#999999'} style={{ pointerEvents: 'none' }}>
        {topLabel}
      </text>
      {model && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={-40} y={46} width={80} height={13} rx={3} fill="#222222" opacity={selected ? 0.92 : 0.72} />
          <text x={0} y={55} textAnchor="middle" fontSize={6.8} fontWeight="700" fill="#FFFFFF">{model}</text>
        </g>
      )}

      {showHandle && (
        <g>
          <line x1={0} y1={-26} x2={0} y2={-40} stroke="#222222" strokeWidth={1.3} />
          <g onMouseDown={(e) => onRotateDown(e, sym.id)} style={{ cursor: 'ew-resize' }}>
            <circle cx={0} cy={-50} r={10} fill="#ffffff" stroke="#222222" strokeWidth={1.3} />
            <text x={0} y={-49} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="#222222" style={{ pointerEvents: 'none' }}>⟳</text>
          </g>
          <text x={0} y={-66} textAnchor="middle" fontSize={9} fontWeight="700" fill="#222222" style={{ pointerEvents: 'none' }}>
            {Math.round(sym.rot)}°
          </text>
        </g>
      )}
    </g>
  )
}

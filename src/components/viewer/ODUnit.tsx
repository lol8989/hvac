// 실외기(ODU) 심볼 — 프레젠테이션 전용(무채색). 본체 드래그로 이동.
import type { UnitSym } from './geometry'

interface ODUnitProps {
  sym: UnitSym
  selected: boolean
  label: string // 예: 실외기-1
  model?: string // 예: RPUW12BX9M
  hp?: number // 마력. 실외기 도면 표기는 장비번호가 아니라 마력이다(0708 회의록)
  onDown: (e: React.MouseEvent, id: string) => void
}

// 실외기는 실내기(카세트)보다 크고 팬 그릴이 있는 박스로 표현.
export default function ODUnit({ sym, selected, label, model, hp, onDown }: ODUnitProps) {
  return (
    <g transform={`translate(${sym.x}, ${sym.y})`} onMouseDown={(e) => onDown(e, sym.id)} style={{ cursor: 'move' }}>
      {selected && (
        <rect x={-52} y={-34} width={104} height={82} rx={8} fill="rgba(34,34,34,0.05)" stroke="#222222" strokeWidth={1.3} strokeDasharray="5 4" />
      )}
      {/* 본체 */}
      <rect x={-48} y={-26} width={96} height={52} rx={6} fill="#ECECEC" stroke="#666666" strokeWidth={1.4} />
      {/* 팬 그릴(원형) */}
      <circle cx={-18} cy={0} r={17} fill="#F7F7F7" stroke="#888888" strokeWidth={1.3} />
      <g stroke="#AAAAAA" strokeWidth={1.2} fill="none">
        <circle cx={-18} cy={0} r={11} />
        <circle cx={-18} cy={0} r={5.5} />
        <line x1={-18} y1={-16} x2={-18} y2={16} />
        <line x1={-34} y1={0} x2={-2} y2={0} />
      </g>
      {/* 토출 루버 */}
      <g stroke="#BBBBBB" strokeWidth={1.4} strokeLinecap="round">
        <line x1={8} y1={-14} x2={40} y2={-14} />
        <line x1={8} y1={-5} x2={40} y2={-5} />
        <line x1={8} y1={4} x2={40} y2={4} />
        <line x1={8} y1={13} x2={40} y2={13} />
      </g>
      {/* 라벨(상단), 모델(하단) — 항상 수평 */}
      <text x={0} y={-32} textAnchor="middle" fontSize={9} fontWeight="700" fill={selected ? '#111111' : '#666666'} style={{ pointerEvents: 'none' }}>
        {label}
      </text>
      {model && (
        <g style={{ pointerEvents: 'none' }}>
          <rect x={-48} y={30} width={96} height={13} rx={3} fill="#222222" opacity={selected ? 0.92 : 0.72} />
          <text x={0} y={39} textAnchor="middle" fontSize={7} fontWeight="700" fill="#FFFFFF">{hp ? `${hp}HP · ${model}` : model}</text>
        </g>
      )}
    </g>
  )
}

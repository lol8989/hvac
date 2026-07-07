// 실(존) 사각형 — 프레젠테이션 전용(무채색). editing 시 모서리 리사이즈 핸들 표시.
import type { ZoneBox, Corner } from './geometry'

interface ZoneRectProps {
  z: ZoneBox
  editing: boolean
  selected: boolean
  areaText?: string // 면적 표기(예: '31.9㎡') — 이름 아래 보조 라벨
  onDown: (e: React.MouseEvent, id: string) => void
  onCornerDown: (e: React.MouseEvent, id: string, corner: Corner) => void
}

const HS = 9 // 핸들 크기

export default function ZoneRect({ z, editing, selected, areaText, onDown, onCornerDown }: ZoneRectProps) {
  const corners: [Corner, number, number, string][] = editing
    ? [
        ['tl', z.x, z.y, 'nwse-resize'],
        ['tr', z.x + z.w, z.y, 'nesw-resize'],
        ['bl', z.x, z.y + z.h, 'nesw-resize'],
        ['br', z.x + z.w, z.y + z.h, 'nwse-resize'],
      ]
    : []
  return (
    <g>
      <g onMouseDown={(e) => onDown(e, z.id)} style={{ cursor: 'pointer' }}>
        <rect
          x={z.x} y={z.y} width={z.w} height={z.h}
          fill={selected ? '#EDEDED' : '#FCFCFC'}
          fillOpacity={selected ? 0.7 : 0.4}
          stroke={selected ? '#222222' : '#C9C9C9'}
          strokeWidth={selected ? 2 : 1.2}
        />
        <text x={z.x + 10} y={z.y + 18} fontSize={12} fontWeight="700" fill={selected ? '#222222' : '#777777'} style={{ pointerEvents: 'none' }}>
          {z.name}
        </text>
        {areaText && (
          <text x={z.x + 10} y={z.y + 32} fontSize={10} fill={selected ? '#444444' : '#999999'} style={{ pointerEvents: 'none' }}>
            {areaText}
          </text>
        )}
      </g>
      {corners.map(([cn, cx, cy, cur]) => (
        <rect
          key={cn} x={cx - HS / 2} y={cy - HS / 2} width={HS} height={HS} rx={2}
          fill="#ffffff" stroke="#222222" strokeWidth={1.3}
          onMouseDown={(e) => onCornerDown(e, z.id, cn)} style={{ cursor: cur }}
        />
      ))}
    </g>
  )
}

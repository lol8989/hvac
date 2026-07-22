// 실(존) 폴리곤 — 프레젠테이션 전용(무채색). editing 시 모서리 리사이즈 핸들 표시.
// 리사이즈 핸들은 축정렬 사각형 실에만 붙는다. 잘린 실(사선·삼각형)에는 '반대편 고정 모서리'라는
// 개념이 없다 — 정점 편집은 백로그(실_슬라이싱_설계_v1 §8).
import type { ZoneBox, Corner } from './geometry'
import { zoneBounds, isRectZone, zoneCentroid } from './geometry'
import type { GroupColor } from '../../presentation/generation/groupColors'

interface ZoneRectProps {
  z: ZoneBox
  editing: boolean
  selected: boolean
  areaText?: string // 면적 표기(예: '31.9㎡') — 이름 아래 보조 라벨
  color?: GroupColor // 실외기 그룹 색(도크 탭 색과 동일). 없으면(미배정) 무채색
  onDown: (e: React.MouseEvent, id: string) => void
  onCornerDown: (e: React.MouseEvent, id: string, corner: Corner) => void
}

const HS = 9 // 핸들 크기

export default function ZoneRect({ z, editing, selected, areaText, color, onDown, onCornerDown }: ZoneRectProps) {
  const b = zoneBounds(z)
  const corners: [Corner, number, number, string][] = editing && isRectZone(z)
    ? [
        ['tl', b.x, b.y, 'nwse-resize'],
        ['tr', b.x + b.w, b.y, 'nesw-resize'],
        ['bl', b.x, b.y + b.h, 'nesw-resize'],
        ['br', b.x + b.w, b.y + b.h, 'nwse-resize'],
      ]
    : []
  // 라벨은 무게중심에 둔다 — 잘린 실에서 bbox 좌상단은 실 밖으로 나간다.
  const c = zoneCentroid(z)
  // 그룹 색이 있으면 배정된 실 — tint로 채우고 head로 테두리. 선택 시 그룹색을 잃지 않도록
  // 더 진한 head 테두리로 선택을 표현한다. 색이 없으면(미배정) 기존 무채색 그대로.
  const fill = color ? color.tint : selected ? '#EDEDED' : '#FCFCFC'
  const fillOpacity = color ? (selected ? 0.95 : 0.7) : selected ? 0.7 : 0.4
  const stroke = color ? color.head : selected ? '#222222' : '#C9C9C9'
  const strokeWidth = selected ? (color ? 2.6 : 2) : color ? 1.6 : 1.2
  return (
    <g>
      <g onMouseDown={(e) => onDown(e, z.id)} style={{ cursor: 'pointer' }}>
        <polygon
          points={z.points.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={fill}
          fillOpacity={fillOpacity}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
        <text x={c.x} y={c.y} textAnchor="middle" fontSize={12} fontWeight="700" fill={selected ? '#222222' : '#777777'} style={{ pointerEvents: 'none' }}>
          {z.name}
        </text>
        {areaText && (
          <text x={c.x} y={c.y + 14} textAnchor="middle" fontSize={10} fill={selected ? '#444444' : '#999999'} style={{ pointerEvents: 'none' }}>
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

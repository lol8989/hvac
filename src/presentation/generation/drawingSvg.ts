// 산출물 도면 생성: 실 경계 + 실내기 심볼 + 실외기 심볼을 독립(standalone) SVG 문자열로 만든다.
// 실서비스는 DXF export 워커가 담당 — POC 대체 산출물.
//
// 심볼은 **화면에서 사용자가 놓은 좌표 그대로** 그린다.
// 예전에는 실내기를 실 중심에 다시 그리고 실외기를 도면 하단에 일렬로 재배치해서,
// 뷰어에서 아무리 옮겨도 산출 도면이 똑같았다(= '실외기 배치' 단계가 산출물에 무기여).

import type { Room } from '../../data'
import type { UnitSym } from '../../components/viewer/geometry'
import { roomLabelAnchor } from './roomLabelAnchor'
import type { GroupColor } from './groupColors'

export interface OutdoorGroupSummary {
  key: string
  label: string
  model: string
  hp?: number // 실외기 도면 표기는 마력이다(장비번호를 쓰지 않는다 — 0708 회의록)
  items: string[]
}

export interface DrawingInput {
  rooms: Record<string, Room>
  indoorSymbols: readonly UnitSym[] // 실내기 1대 = 심볼 1개 (좌표·회전 포함)
  indoorModelByRoom: Record<string, string> // 실별 적용 실내기 모델명(라벨)
  groups: readonly OutdoorGroupSummary[]
  outdoorPositions: Record<string, { x: number; y: number }> // 그룹 key → 도면 좌표. 없으면 미배치
  roomColors?: Record<string, GroupColor> // 실 id → 실외기 그룹 색(화면·도크와 동일). 미배정 실은 없음 → 무채색
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const round = (v: number): number => Math.round(v * 10) / 10

const PAD = 24
const ODU_W = 120
const ODU_H = 44

export const buildDrawingSvg = ({ rooms, indoorSymbols, indoorModelByRoom, groups, outdoorPositions, roomColors }: DrawingInput): string => {
  const rs = Object.entries(rooms)

  // 실은 폴리곤이다 — 사각형은 정점 4개짜리 특수 케이스일 뿐이고, V 도구로 자르면 사선이 생긴다.
  // 화면에서 자른 모양이 그대로 산출 도면에 실려야 한다. 배정된 실은 실외기 그룹 색(화면과 동일).
  const roomEls = rs.map(([id, r]) => {
    const pts = r.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
    const label = roomLabelAnchor(r.points) // 실 위쪽 안 — 중앙은 실내기 심볼 자리다
    const color = roomColors?.[id]
    const poly = color
      ? `<polygon points="${pts}" fill="${color.tint}" fill-opacity="0.7" stroke="${color.head}" stroke-width="1.5"/>`
      : `<polygon points="${pts}" fill="none" stroke="#333333"/>`
    return (
      `<g>${poly}` +
      `<text x="${round(label.x)}" y="${round(label.y)}" font-size="10" text-anchor="middle" fill="#000000">${esc(id)} ${esc(r.name)} (${round(r.area)}㎡)</text></g>`
    )
  })

  // 실내기: 놓인 좌표·회전 그대로. 라벨은 회전 밖(항상 수평).
  // 모델 배지는 실외기 그룹 색(head)으로 칠해 "이 실내기가 어느 실외기 소속인지" 표시(화면과 동일).
  const indoorEls = indoorSymbols.map((s) => {
    const model = s.roomId ? indoorModelByRoom[s.roomId] : undefined
    const color = s.roomId ? roomColors?.[s.roomId] : undefined
    const label = model
      ? color
        ? `<g><rect x="-28" y="20" width="56" height="12" rx="2" fill="${color.head}"/>` +
          `<text x="0" y="29" font-size="7.5" text-anchor="middle" fill="#ffffff">${esc(model)}</text></g>`
        : `<text x="0" y="28" font-size="9" text-anchor="middle" fill="#333333">${esc(model)}</text>`
      : ''
    return (
      `<g transform="translate(${s.x}, ${s.y})">` +
      `<g transform="rotate(${s.rot})">` +
      `<rect x="-14" y="-14" width="28" height="28" fill="#ffffff" stroke="#000000"/>` +
      `<line x1="-14" y1="0" x2="14" y2="0" stroke="#000000"/>` +
      `</g>${label}</g>`
    )
  })

  // 실외기: 연결 실내기가 있고 도면에 놓인 그룹만.
  const oduEls = groups
    .filter((g) => g.items.length && outdoorPositions[g.key])
    .map((g) => {
      const p = outdoorPositions[g.key]
      return (
        `<g transform="translate(${p.x}, ${p.y})">` +
        `<rect x="${-ODU_W / 2}" y="${-ODU_H / 2}" width="${ODU_W}" height="${ODU_H}" fill="#ffffff" stroke="#000000"/>` +
        `<text x="${-ODU_W / 2 + 8}" y="${-ODU_H / 2 + 18}" font-size="10" font-weight="bold" fill="#000000">${esc(g.label)}</text>` +
        `<text x="${-ODU_W / 2 + 8}" y="${-ODU_H / 2 + 34}" font-size="9" fill="#333333">${g.hp ? `${g.hp}HP · ` : ''}${esc(g.model)} · 연결 ${g.items.length}</text></g>`
      )
    })

  // 뷰박스는 실·실내기·실외기를 모두 담는다(실외기는 건물 외부라 도면 밖으로 나간다).
  // 좌/상단 바깥(음수 좌표)에 놓은 실외기도 담아야 한다 — 예전엔 viewBox가 '0 0 W H'라
  // 건물 왼쪽에 배치한 실외기가 산출 도면에서 통째로 사라졌다(적대적 QA).
  const xs = [
    ...rs.flatMap(([, r]) => r.points.map((p) => p.x)),
    ...indoorSymbols.flatMap((s) => [s.x - 20, s.x + 20]),
    ...Object.values(outdoorPositions).flatMap((p) => [p.x - ODU_W / 2, p.x + ODU_W / 2]),
    0,
    720,
  ]
  const ys = [
    ...rs.flatMap(([, r]) => r.points.map((p) => p.y)),
    ...indoorSymbols.flatMap((s) => [s.y - 20, s.y + 32]),
    ...Object.values(outdoorPositions).flatMap((p) => [p.y - ODU_H / 2, p.y + ODU_H / 2]),
    0,
    470,
  ]
  const minX = Math.floor(Math.min(...xs)) - PAD
  const minY = Math.floor(Math.min(...ys)) - PAD
  const W = Math.ceil(Math.max(...xs)) + PAD - minX
  const H = Math.ceil(Math.max(...ys)) + PAD - minY

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${W} ${H}" font-family="Noto Sans KR, sans-serif">` +
    `<rect x="${minX}" y="${minY}" width="${W}" height="${H}" fill="#ffffff"/>` +
    roomEls.join('') +
    indoorEls.join('') +
    oduEls.join('') +
    `</svg>`
  )
}

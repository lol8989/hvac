// 산출물 도면 생성: 실 경계 + 실내기 심볼 + 실외기 심볼을 독립(standalone) SVG 문자열로 만든다.
// 실서비스는 DXF export 워커가 담당 — POC 대체 산출물.
//
// 심볼은 **화면에서 사용자가 놓은 좌표 그대로** 그린다.
// 예전에는 실내기를 실 중심에 다시 그리고 실외기를 도면 하단에 일렬로 재배치해서,
// 뷰어에서 아무리 옮겨도 산출 도면이 똑같았다(= '실외기 배치' 단계가 산출물에 무기여).

import type { Room } from '../../data'
import type { UnitSym } from '../../components/viewer/geometry'

export interface OutdoorGroupSummary {
  key: string
  label: string
  model: string
  items: string[]
}

export interface DrawingInput {
  rooms: Record<string, Room>
  indoorSymbols: readonly UnitSym[] // 실내기 1대 = 심볼 1개 (좌표·회전 포함)
  indoorModelByRoom: Record<string, string> // 실별 적용 실내기 모델명(라벨)
  groups: readonly OutdoorGroupSummary[]
  outdoorPositions: Record<string, { x: number; y: number }> // 그룹 key → 도면 좌표. 없으면 미배치
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const PAD = 24
const ODU_W = 120
const ODU_H = 44

export const buildDrawingSvg = ({ rooms, indoorSymbols, indoorModelByRoom, groups, outdoorPositions }: DrawingInput): string => {
  const rs = Object.entries(rooms)

  const roomEls = rs.map(([id, r]) => {
    return (
      `<g><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#333333"/>` +
      `<text x="${r.x + 6}" y="${r.y + 14}" font-size="10" fill="#000000">${esc(id)} ${esc(r.name)} (${r.area}㎡)</text></g>`
    )
  })

  // 실내기: 놓인 좌표·회전 그대로. 라벨은 회전 밖(항상 수평).
  const indoorEls = indoorSymbols.map((s) => {
    const model = s.roomId ? indoorModelByRoom[s.roomId] : undefined
    const label = model
      ? `<text x="0" y="28" font-size="9" text-anchor="middle" fill="#333333">${esc(model)}</text>`
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
        `<text x="${-ODU_W / 2 + 8}" y="${-ODU_H / 2 + 34}" font-size="9" fill="#333333">${esc(g.model)} · 연결 ${g.items.length}</text></g>`
      )
    })

  // 뷰박스는 실·실내기·실외기를 모두 담는다(실외기는 건물 외부라 도면 밖으로 나간다).
  const xs = [
    ...rs.map(([, r]) => r.x + r.w),
    ...indoorSymbols.map((s) => s.x + 20),
    ...Object.values(outdoorPositions).map((p) => p.x + ODU_W / 2),
    720,
  ]
  const ys = [
    ...rs.map(([, r]) => r.y + r.h),
    ...indoorSymbols.map((s) => s.y + 32),
    ...Object.values(outdoorPositions).map((p) => p.y + ODU_H / 2),
    470,
  ]
  const W = Math.ceil(Math.max(...xs)) + PAD
  const H = Math.ceil(Math.max(...ys)) + PAD

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Noto Sans KR, sans-serif">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    roomEls.join('') +
    indoorEls.join('') +
    oduEls.join('') +
    `</svg>`
  )
}

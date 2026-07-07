// 산출물 도면 생성(목업 데이터 기반): 실 경계 + 배정된 실내기 심볼 + 실외기 심볼을
// 독립(standalone) SVG 문자열로 만든다. 실서비스는 DXF export 워커가 담당 — POC 대체 산출물.

import type { Room } from '../../data'

export interface OutdoorGroupSummary {
  key: string
  label: string
  model: string
  items: string[]
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const ODU_BAND = 90 // 하단 실외기 대역 높이
const PAD = 24

export const buildDrawingSvg = (
  rooms: Record<string, Room>,
  indoorByRoom: Record<string, string>,
  groups: OutdoorGroupSummary[],
): string => {
  const rs = Object.entries(rooms)
  const maxX = rs.reduce((a, [, r]) => Math.max(a, r.x + r.w), 720)
  const maxY = rs.reduce((a, [, r]) => Math.max(a, r.y + r.h), 470)
  const W = maxX + PAD
  const H = maxY + PAD + ODU_BAND

  const roomEls = rs.map(([id, r]) => {
    const model = indoorByRoom[id]
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const sym = model
      ? `<rect x="${cx - 14}" y="${cy - 14}" width="28" height="28" fill="#ffffff" stroke="#000000"/>` +
        `<line x1="${cx - 14}" y1="${cy}" x2="${cx + 14}" y2="${cy}" stroke="#000000"/>` +
        `<text x="${cx}" y="${cy + 28}" font-size="9" text-anchor="middle" fill="#333333">${esc(model)}</text>`
      : ''
    return (
      `<g><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="#333333"/>` +
      `<text x="${r.x + 6}" y="${r.y + 14}" font-size="10" fill="#000000">${esc(id)} ${esc(r.name)} (${r.area}㎡)</text>${sym}</g>`
    )
  })

  // 연결 실내기가 있는 그룹만 도면 하단(건물 외부)에 나열.
  const oduEls = groups
    .filter((g) => g.items.length)
    .map((g, i) => {
      const x = PAD + i * 150
      const y = maxY + PAD + 12
      return (
        `<g><rect x="${x}" y="${y}" width="120" height="44" fill="#ffffff" stroke="#000000"/>` +
        `<text x="${x + 8}" y="${y + 18}" font-size="10" font-weight="bold" fill="#000000">${esc(g.label)}</text>` +
        `<text x="${x + 8}" y="${y + 34}" font-size="9" fill="#333333">${esc(g.model)} · 연결 ${g.items.length}</text></g>`
      )
    })

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Noto Sans KR, sans-serif">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
    roomEls.join('') +
    oduEls.join('') +
    `</svg>`
  )
}

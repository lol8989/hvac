import { describe, it, expect } from 'vitest'
import { buildDrawingSvg } from './drawingSvg'
import type { DrawingInput } from './drawingSvg'
import type { Room } from '../../data'
import { rectPoints } from '../../components/viewer/geometry'

const room = (name: string, x: number, y: number): Room => ({ name, floor: '지상1층', usage: '거실', area: 20, type: '4WAY', cool: 9.0, shortSideM: 3.5, longSideM: 5.8, sys: 'EHP', points: rectPoints(x, y, 200, 120) })
const ROOMS_FX: Record<string, Room> = {
  AC_001: room('거실', 24, 24),
  AC_002: room('침실', 260, 24),
}
const GROUPS_FX = [
  { key: 'ODU1', label: '실외기-1', model: 'RPUW12BX9M', items: ['AC_001'] },
  { key: 'ODU2', label: '실외기-2', model: 'GPUW280C2S', items: [] as string[] },
]

const input = (over: Partial<DrawingInput> = {}): DrawingInput => ({
  rooms: ROOMS_FX,
  indoorSymbols: [],
  indoorModelByRoom: {},
  groups: [],
  outdoorPositions: {},
  ...over,
})

describe('buildDrawingSvg (도면 좌표 → 독립 SVG 도면)', () => {
  it('유효한 SVG 루트와 모든 실(id·이름) 표기를 포함한다', () => {
    const svg = buildDrawingSvg(input())
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('AC_001')
    expect(svg).toContain('거실')
    expect(svg).toContain('침실')
  })

  it('실내기를 화면에서 놓인 좌표 그대로 그린다 (실 중심 고정이 아니다)', () => {
    const svg = buildDrawingSvg(
      input({
        indoorSymbols: [{ id: 'AC_001#1', roomId: 'AC_001', x: 111, y: 222, rot: 0 }],
        indoorModelByRoom: { AC_001: 'R-W0901A2U' },
      }),
    )
    expect(svg).toContain('R-W0901A2U')
    expect(svg).toContain('translate(111, 222)')
  })

  it('한 실에 2대면 심볼도 2개다 (대수 = 심볼 수)', () => {
    const svg = buildDrawingSvg(
      input({
        indoorSymbols: [
          { id: 'AC_001#1', roomId: 'AC_001', x: 60, y: 60, rot: 0 },
          { id: 'AC_001#2', roomId: 'AC_001', x: 160, y: 60, rot: 90 },
        ],
        indoorModelByRoom: { AC_001: 'R-W0901A2U' },
      }),
    )
    expect(svg.split('R-W0901A2U')).toHaveLength(3) // 2회 등장
    expect(svg).toContain('rotate(90)')
  })

  it('실내기가 없는 실에는 심볼이 없다', () => {
    const svg = buildDrawingSvg(input({ indoorModelByRoom: { AC_001: 'R-W0901A2U' } }))
    expect(svg).not.toContain('R-W0901A2U') // 심볼이 없으면 모델명도 안 나온다
  })

  it('실외기는 도면에 놓인 좌표에 그린다 (하단 일렬 고정이 아니다)', () => {
    const svg = buildDrawingSvg(input({ groups: GROUPS_FX, outdoorPositions: { ODU1: { x: 500, y: 900 } } }))
    expect(svg).toContain('실외기-1')
    expect(svg).toContain('RPUW12BX9M')
    expect(svg).toContain('translate(500, 900)')
  })

  it('좌표가 없는(도면에 안 놓인) 실외기는 그리지 않는다', () => {
    const svg = buildDrawingSvg(input({ groups: GROUPS_FX, outdoorPositions: {} }))
    expect(svg).not.toContain('실외기-1')
  })

  it('연결 실내기가 없는 실외기는 좌표가 있어도 그리지 않는다(산출물에서 제외)', () => {
    const svg = buildDrawingSvg(input({ groups: GROUPS_FX, outdoorPositions: { ODU2: { x: 10, y: 10 } } }))
    expect(svg).not.toContain('실외기-2')
  })

  const viewBox = (svg: string) => {
    const m = /viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(svg)!
    const [x, y, w, h] = m.slice(1).map(Number)
    return { x, y, w, h, right: x + w, bottom: y + h }
  }

  it('실외기가 도면 밖(아래)에 있어도 viewBox가 그것을 담는다', () => {
    const svg = buildDrawingSvg(input({ groups: GROUPS_FX, outdoorPositions: { ODU1: { x: 500, y: 900 } } }))
    const vb = viewBox(svg)
    expect(vb.right).toBeGreaterThan(500)
    expect(vb.bottom).toBeGreaterThan(900)
  })

  // 건물 왼쪽·위쪽에 실외기를 놓는 것은 자연스러운 배치다.
  // viewBox가 '0 0 W H'로 고정이면 그 심벌이 산출 도면에서 통째로 사라진다(적대적 QA).
  it('실외기가 도면 왼쪽·위쪽(음수 좌표)에 있어도 viewBox가 그것을 담는다', () => {
    const svg = buildDrawingSvg(input({ groups: GROUPS_FX, outdoorPositions: { ODU1: { x: -200, y: -80 } } }))
    const vb = viewBox(svg)
    expect(vb.x).toBeLessThan(-200 - 60) // 본체 폭(120)의 절반까지 담는다
    expect(vb.y).toBeLessThan(-80 - 22)
    expect(svg).toContain('실외기-1')
  })

  it('배정된 실은 그룹 색(tint 채움·head 테두리)으로, 미배정 실은 무채색으로 그린다', () => {
    const svg = buildDrawingSvg(
      input({ roomColors: { AC_001: { head: '#2f5fae', tint: '#eef3fb' } } }),
    )
    // 배정 실(AC_001): tint 채움 + head 테두리
    expect(svg).toContain('fill="#eef3fb"')
    expect(svg).toContain('stroke="#2f5fae"')
    // 미배정 실(AC_002): 여전히 무채색(fill none)
    expect(svg).toContain('fill="none" stroke="#333333"')
  })

  it('실내기 모델 배지를 그룹 색(head)으로 칠한다', () => {
    const svg = buildDrawingSvg(
      input({
        indoorSymbols: [{ id: 'AC_001#1', roomId: 'AC_001', x: 60, y: 60, rot: 0 }],
        indoorModelByRoom: { AC_001: 'R-W0901A2U' },
        roomColors: { AC_001: { head: '#1f8a80', tint: '#e8f5f3' } },
      }),
    )
    expect(svg).toContain('fill="#1f8a80"') // 배지 pill
    expect(svg).toContain('R-W0901A2U')
  })

  it('XML 특수문자를 이스케이프한다', () => {
    const rooms = { AC_001: { ...room('회의실<A&B>', 0, 0) } }
    const svg = buildDrawingSvg(input({ rooms }))
    expect(svg).toContain('회의실&lt;A&amp;B&gt;')
    expect(svg).not.toContain('회의실<A&B>')
  })
})

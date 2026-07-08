import { describe, it, expect } from 'vitest'
import { buildDrawingSvg } from './drawingSvg'
import type { Room } from '../../data'

const room = (name: string, x: number, y: number): Room => ({ name, floor: '지상1층', usage: '거실', area: 20, type: '4WAY', cool: 9.0, sys: 'EHP', x, y, w: 200, h: 120 })
const ROOMS_FX: Record<string, Room> = {
  AC_001: room('거실', 24, 24),
  AC_002: room('침실', 260, 24),
}
const GROUPS_FX = [
  { key: 'ODU1', label: '실외기-1', model: 'RPUW12BX9M', items: ['AC_001'] },
  { key: 'ODU2', label: '실외기-2', model: 'GPUW280C2S', items: [] as string[] },
]

describe('buildDrawingSvg (목업 데이터 → 독립 SVG 도면)', () => {
  it('유효한 SVG 루트와 모든 실(id·이름) 표기를 포함한다', () => {
    const svg = buildDrawingSvg(ROOMS_FX, {}, [])
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('AC_001')
    expect(svg).toContain('거실')
    expect(svg).toContain('침실')
  })

  it('실내기가 적용된 실에만 실내기 심볼(모델명)을 그린다', () => {
    const svg = buildDrawingSvg(ROOMS_FX, { AC_001: 'R-W0901A2U' }, [])
    expect(svg).toContain('R-W0901A2U')
    // 미적용 실(AC_002)에는 심볼 라벨 없음 → 모델명 1회만 등장
    expect(svg.split('R-W0901A2U')).toHaveLength(2)
  })

  it('연결 실내기가 있는 실외기 그룹만 하단에 심볼로 그린다', () => {
    const svg = buildDrawingSvg(ROOMS_FX, {}, GROUPS_FX)
    expect(svg).toContain('실외기-1')
    expect(svg).toContain('RPUW12BX9M')
    expect(svg).not.toContain('실외기-2') // 빈 그룹 제외
  })

  it('XML 특수문자를 이스케이프한다', () => {
    const rooms = { AC_001: { ...room('회의실<A&B>', 0, 0) } }
    const svg = buildDrawingSvg(rooms, {}, [])
    expect(svg).toContain('회의실&lt;A&amp;B&gt;')
    expect(svg).not.toContain('회의실<A&B>')
  })
})

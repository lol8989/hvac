import { describe, it, expect } from 'vitest'
import { buildClearanceReport } from './clearanceReport'

const MM_PER_UNIT = 94.81 // 실도면 목업 축척(정규화 1단위 ≈ 94.8mm)
// 본체 1240×760mm 기준. 1단위 ≈ 94.8mm라 15단위 ≈ 1422mm.
const groups = [
  { key: 'G1', label: '실외기-1' },
  { key: 'G2', label: '실외기-2' },
]

describe('buildClearanceReport — 축척을 모를 때', () => {
  it('검사하지 않았음을 명시한다 (위반 0건과 구분)', () => {
    const r = buildClearanceReport({
      groups,
      positions: { G1: { x: 0, y: 0 }, G2: { x: 1, y: 0 } }, // 붙어 있어도
      mmPerUnit: undefined,
    })
    expect(r.checked).toBe(false)
    expect(r.violations).toEqual([])
  })
})

describe('buildClearanceReport — 실도면(mm 좌표계)', () => {
  it('충분히 떨어져 있으면 검사했고 위반이 없다', () => {
    const r = buildClearanceReport({
      groups,
      positions: { G1: { x: 0, y: 0 }, G2: { x: 100, y: 0 } }, // ≈ 9481mm
      mmPerUnit: MM_PER_UNIT,
    })
    expect(r.checked).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('좌우로 붙여 놓으면 위반을 보고한다', () => {
    const r = buildClearanceReport({
      groups,
      positions: { G1: { x: 0, y: 0 }, G2: { x: 14, y: 0 } }, // ≈ 1327mm < 1240+200
      mmPerUnit: MM_PER_UNIT,
    })
    expect(r.checked).toBe(true)
    expect(r.violations).toHaveLength(1)
    expect(r.violations[0]).toContain('실외기-1')
    expect(r.violations[0]).toContain('실외기-2')
  })

  it('도면에 놓이지 않은 그룹은 검사 대상이 아니다', () => {
    const r = buildClearanceReport({
      groups,
      positions: { G1: { x: 0, y: 0 } }, // G2 미배치
      mmPerUnit: MM_PER_UNIT,
    })
    expect(r.checked).toBe(true)
    expect(r.violations).toEqual([])
  })

  it('배치된 실외기가 1대뿐이면 서로 간격을 잴 대상이 없다', () => {
    const r = buildClearanceReport({
      groups: [groups[0]],
      positions: { G1: { x: 0, y: 0 } },
      mmPerUnit: MM_PER_UNIT,
    })
    expect(r.checked).toBe(true)
    expect(r.violations).toEqual([])
  })
})

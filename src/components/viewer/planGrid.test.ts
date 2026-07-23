import { describe, it, expect } from 'vitest'
import { planGridOf, snapTo, MOCK_GRID } from './planGrid'

// 실도면 목업값: 폭 126,000mm(126m)를 정규화 폭 1329단위로 그린다.
const MM_PER_UNIT = 126000 / 1329 // ≈ 94.81

describe('planGridOf — 축척을 모를 때(목업 좌표계)', () => {
  it('mmPerUnit이 없으면 정규화 단위 기본 격자를 쓰고 실치수를 말하지 않는다', () => {
    const g = planGridOf(720, undefined)
    expect(g.step).toBe(MOCK_GRID)
    expect(g.mm).toBeNull()
    expect(g.label).toBeNull() // 모르는 치수를 지어내지 않는다
  })
})

describe('planGridOf — 실도면(mm 좌표계)', () => {
  it('도면 폭에 맞는 딱 떨어지는 실치수(1·2·5·10 계열)를 고른다', () => {
    const g = planGridOf(1329, MM_PER_UNIT)
    expect(g.mm).toBe(2000) // 126m ÷ 100칸 ≈ 1.26m → 계열에서 2m
    expect(g.label).toBe('2m')
  })

  it('격자 간격(step)은 그 실치수를 정규화 단위로 환산한 값이다', () => {
    const g = planGridOf(1329, MM_PER_UNIT)
    expect(g.step).toBeCloseTo(2000 / MM_PER_UNIT, 6)
    expect(g.step * MM_PER_UNIT).toBeCloseTo(2000, 6) // 왕복 정합
  })

  it('1m 미만이면 mm로 표기한다', () => {
    // 폭 30m 도면: 30000 ÷ 100 = 300 → 계열에서 500mm
    const g = planGridOf(1000, 30)
    expect(g.mm).toBe(500)
    expect(g.label).toBe('500mm')
  })

  it('격자 칸 수는 100칸 언저리다(너무 촘촘하거나 성기지 않다)', () => {
    for (const widthMm of [5000, 30000, 126000, 1_000_000]) {
      const g = planGridOf(1000, widthMm / 1000)
      const cells = widthMm / g.mm!
      expect(cells).toBeGreaterThanOrEqual(10)
      expect(cells).toBeLessThanOrEqual(100)
    }
  })
})

describe('snapTo', () => {
  it('가장 가까운 격자점으로 반올림한다', () => {
    expect(snapTo(9, 20)).toBe(0)
    expect(snapTo(11, 20)).toBe(20)
    expect(snapTo(-11, 20)).toBe(-20)
  })

  it('격자가 정수가 아니어도(실치수 환산) 배수로 떨어진다', () => {
    const step = 2000 / MM_PER_UNIT
    expect(snapTo(step * 2.4, step)).toBeCloseTo(step * 2, 6)
  })

  it('step이 0 이하면 스냅하지 않는다(0으로 나누지 않는다)', () => {
    expect(snapTo(7.3, 0)).toBe(7.3)
    expect(snapTo(7.3, -5)).toBe(7.3)
  })
})

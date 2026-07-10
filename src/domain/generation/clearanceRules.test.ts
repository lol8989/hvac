// 실외기 이격거리 테스트.
// 본체 1240 × 760mm. 좌우 200 이상이거나 앞뒤 900 이상이면 괜찮다(둘 다 못 지키면 위반).

import { describe, it, expect } from 'vitest'
import { checkClearances, ODU_BODY_W_MM, ODU_BODY_D_MM, MIN_SIDE_GAP_MM, MIN_FRONT_GAP_MM } from './clearanceRules'
import type { OutdoorPlacementMm } from './clearanceRules'

const at = (key: string, x: number, y: number): OutdoorPlacementMm => ({ key, label: key, x, y })

// 나란히(같은 행) 놓을 때 중심 간 x 거리 = 본체폭 + 간격
const sideBySide = (gapMm: number) => [at('A', 0, 0), at('B', ODU_BODY_W_MM + gapMm, 0)]
// 앞뒤로 마주볼 때 중심 간 y 거리 = 본체깊이 + 간격
const frontToFront = (gapMm: number) => [at('A', 0, 0), at('B', 0, ODU_BODY_D_MM + gapMm)]

describe('checkClearances — 좌우(측면) 간격', () => {
  it(`[경계] 좌우 ${MIN_SIDE_GAP_MM}mm는 통과`, () => {
    expect(checkClearances(sideBySide(MIN_SIDE_GAP_MM))).toEqual([])
  })

  it('[경계] 좌우 199mm는 위반', () => {
    const v = checkClearances(sideBySide(MIN_SIDE_GAP_MM - 1))
    expect(v).toHaveLength(1)
    expect(v[0].gapXMm).toBe(199)
    expect(v[0].message).toContain('좌우 간격 199mm')
    expect(v[0].message).toContain('최소 200mm')
  })

  it('좌우로 넉넉하면 앞뒤가 가까워도 괜찮다(다른 열)', () => {
    expect(checkClearances([at('A', 0, 0), at('B', ODU_BODY_W_MM + 500, 100)])).toEqual([])
  })
})

describe('checkClearances — 앞뒤(토출면) 간격', () => {
  it(`[경계] 앞뒤 ${MIN_FRONT_GAP_MM}mm는 통과`, () => {
    expect(checkClearances(frontToFront(MIN_FRONT_GAP_MM))).toEqual([])
  })

  it('[경계] 앞뒤 899mm는 위반', () => {
    const v = checkClearances(frontToFront(MIN_FRONT_GAP_MM - 1))
    expect(v).toHaveLength(1)
    expect(v[0].gapYMm).toBe(899)
    expect(v[0].message).toContain('앞뒤 간격 899mm')
  })

  it('앞뒤로 넉넉하면 좌우가 겹쳐도 괜찮다(마주보는 열)', () => {
    expect(checkClearances([at('A', 0, 0), at('B', 0, ODU_BODY_D_MM + MIN_FRONT_GAP_MM)])).toEqual([])
  })
})

describe('checkClearances — 겹침·대각선', () => {
  it('본체가 겹치면 위반이고 그렇게 말해준다', () => {
    const v = checkClearances([at('A', 0, 0), at('B', 100, 100)])
    expect(v).toHaveLength(1)
    expect(v[0].message).toContain('본체가 겹칩니다')
    expect(v[0].gapXMm).toBeLessThan(0)
    expect(v[0].gapYMm).toBeLessThan(0)
  })

  it('완전히 같은 자리면 위반', () => {
    expect(checkClearances([at('A', 500, 500), at('B', 500, 500)])).toHaveLength(1)
  })

  it('대각선으로 충분히 떨어지면 통과', () => {
    expect(checkClearances([at('A', 0, 0), at('B', ODU_BODY_W_MM + 250, ODU_BODY_D_MM + 100)])).toEqual([])
  })
})

describe('checkClearances — 다중·경계 입력', () => {
  it('실외기가 0대·1대면 위반이 없다', () => {
    expect(checkClearances([])).toEqual([])
    expect(checkClearances([at('A', 0, 0)])).toEqual([])
  })

  it('모든 쌍을 검사한다(3대 = 3쌍)', () => {
    const v = checkClearances([at('A', 0, 0), at('B', 100, 0), at('C', 200, 0)])
    expect(v).toHaveLength(3)
    expect(v.map((x) => `${x.a}-${x.b}`)).toEqual(['A-B', 'A-C', 'B-C'])
  })

  it('같은 입력은 같은 결과를 낸다(결정적)', () => {
    const p = [at('A', 0, 0), at('B', 100, 0), at('C', 5000, 0)]
    expect(checkClearances(p)).toEqual(checkClearances(p))
  })

  it('좌우가 음수 거리(순서 무관)여도 절댓값으로 본다', () => {
    expect(checkClearances([at('A', ODU_BODY_W_MM + 500, 0), at('B', 0, 0)])).toEqual([])
  })
})

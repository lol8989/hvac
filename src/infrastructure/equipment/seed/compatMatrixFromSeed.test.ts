import { describe, it, expect } from 'vitest'
import { compatMatrixFromSeed, buildOverrideKey } from './compatMatrixFromSeed'

describe('compatMatrixFromSeed (현업 확정 조합표 → CompatMatrix)', () => {
  const m = compatMatrixFromSeed()

  it('실외기 35행 × 실내기 39열을 만든다', () => {
    expect(m.outdoorRows).toHaveLength(35)
    expect(m.indoorColumns).toHaveLength(39)
  })

  const outdoor = (series: string) => m.outdoorRows.find((r) => r.series === series)!
  const indoor = (subcategory: string, series: string) => m.indoorColumns.find((c) => c.subcategory === subcategory && c.series === series)!

  it('GHP Super III는 대공간덕트만 연결 가능하다 (계열 축으로는 못 잡는 예외)', () => {
    const ghp = outdoor('GHP Super III')
    const bigDuct = indoor('덕트(대공간)', 'Multi V 실내기(대공간덕트)')
    const cassette = indoor('4WAY 카세트', 'Multi V 실내기(민수전용)')
    expect(m.isCompatible(ghp, bigDuct)).toBe(true)
    expect(m.isCompatible(ghp, cassette)).toBe(false)
  })

  it('EHP 냉난방 절환형(Multi V Super 5 고급형)은 4WAY 카세트와 연결 가능하다', () => {
    const super5 = outdoor('Multi V Super 5(고급형)')
    const cassette = indoor('4WAY 카세트', 'Multi V 실내기(민수전용)')
    expect(m.isCompatible(super5, cassette)).toBe(true)
  })

  it('수냉식 칠러는 어떤 실내기와도 연결되지 않는다', () => {
    const chiller = outdoor('Water-Cooled Scroll Chiller')
    expect(m.indoorColumns.every((col) => !chiller || !m.isCompatible(chiller, col))).toBe(true)
  })

  it('overrides가 있으면 해당 칸을 덮어쓴다', () => {
    const ghp = { subcategory: 'GHP', series: 'GHP Super III' }
    const cassette = { subcategory: '4WAY 카세트', series: 'Multi V 실내기(민수전용)' }
    const over = new Map([[buildOverrideKey(ghp, cassette), 'O' as const]])
    const edited = compatMatrixFromSeed(over)
    expect(edited.isCompatible(edited.outdoorRows.find((r) => r.series === 'GHP Super III')!, edited.indoorColumns.find((c) => c.subcategory === '4WAY 카세트' && c.series === 'Multi V 실내기(민수전용)')!)).toBe(true)
    // 원본(무 override)은 그대로 X
    expect(compatMatrixFromSeed().isCompatible(outdoor('GHP Super III'), indoor('4WAY 카세트', 'Multi V 실내기(민수전용)'))).toBe(false)
  })
})

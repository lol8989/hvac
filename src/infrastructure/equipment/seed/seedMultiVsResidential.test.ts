// Multi V S(주거) — 현업 회신 조합표 탭의 정정을 시드에 고정한다.
//
// 판정 기준(주인님 확인 2026-07-20): **조합표 탭이 정본**이다.
// 함께 온 '실내기/실외기 시리즈 근거자료' 탭은 우리가 만들어 보낸 자료라 현업이 손대지 않았다.
//
// 근거: doc/05_설계결정/실내외기_조합_확인표_현업회신_반영_2026-07-16.md §9

import { describe, it, expect } from 'vitest'
import { nodeSeed } from '../../../test/seedFixture'

const axesOf = (seriesName: string) => {
  const seed = nodeSeed()
  const subs = new Map(seed.subcategories.map((s) => [s.code, s]))
  return seed.series
    .filter((s) => s.nameKo === seriesName)
    .map((s) => {
      const sub = subs.get(s.subcategoryCode)!
      return {
        category: sub.categoryCode,
        subcategory: sub.nameKo,
        models: seed.products.filter((p) => p.seriesCode === s.code),
      }
    })
}

describe('Multi V S(주거) — 현업 조합표 정정', () => {
  it('실외기는 냉방전용이다 (절환형이 아니다)', () => {
    const outdoor = axesOf('Multi V S(주거)').filter((a) => a.category === 'OUTDOOR')
    expect(outdoor).toHaveLength(1)
    expect(outdoor[0].subcategory).toBe('냉방전용')
  })

  // 현업 주석은 '인듯합니다'로 추정이었지만 우리 스펙시트가 이를 확증한다.
  // 절환형이라면 난방용량이 있어야 한다 — 다른 절환형 시리즈는 100% 있다.
  it('실외기 전 모델에 난방용량이 없다 — 냉방전용 분류의 물증', () => {
    const outdoor = axesOf('Multi V S(주거)').find((a) => a.category === 'OUTDOOR')!
    expect(outdoor.models.length).toBeGreaterThan(0)
    for (const m of outdoor.models) expect(m.heatingW).toBeFalsy()
  })

  it('절환형으로 남은 시리즈들은 난방용량을 갖는다 (대조군)', () => {
    const seed = nodeSeed()
    const subs = new Map(seed.subcategories.map((s) => [s.code, s]))
    const hr = seed.series.filter((s) => subs.get(s.subcategoryCode)?.nameKo === '냉난방 절환형')
    expect(hr.length).toBeGreaterThan(0)
    for (const s of hr) {
      const models = seed.products.filter((p) => p.seriesCode === s.code)
      if (models.length === 0) continue
      expect(models.some((m) => m.heatingW)).toBe(true)
    }
  })

  // 조합표 탭: '1WAY 카세트(듀얼베인) | Multi V S(주거) (4way->1way수정)'
  it('듀얼베인 실내기는 1WAY다 (현업이 4WAY를 1WAY로 정정)', () => {
    const dv = axesOf('Multi V S(주거)').filter((a) => a.subcategory.includes('듀얼베인'))
    expect(dv).toHaveLength(1)
    expect(dv[0].subcategory).toBe('1WAY 카세트(듀얼베인)')
  })

  it('정정은 Multi V S(주거)에만 적용된다 — 다른 라인업의 듀얼베인은 4WAY 그대로', () => {
    for (const name of ['Multi V 실내기(민수전용)', 'Multi V 실내기(조달전용)', 'SINGLE / Universal']) {
      const dv = axesOf(name).filter((a) => a.subcategory.includes('듀얼베인'))
      for (const a of dv) expect(a.subcategory).toBe('4WAY 카세트(듀얼베인)')
    }
  })

  it("천장형 실내기가 '기타 실내기'로 뭉쳐 있지 않다", () => {
    const subs = axesOf('Multi V S(주거)').map((a) => a.subcategory)
    expect(subs).toContain('천장형')
    expect(subs).not.toContain('기타 실내기')
  })
})

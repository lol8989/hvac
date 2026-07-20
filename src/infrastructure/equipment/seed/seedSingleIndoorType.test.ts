// 단품(SINGLE / Universal) 실내기 유형 — 모델코드 앞글자가 정한다.
//
// 현업 회신(2026-07-16 질문 5): "T= 카세트 / P= 스탠드 / V=상업용 천장형(카세트와 형상이 다릅니다.) / B=덕트형"
// 우리가 질문에 'B=벽걸이형으로 이해했다'고 적었고 현업이 **덕트형으로 정정**했다.
// 이 테스트는 그 정정이 시드에 살아 있는지 고정한다 — 앞글자 규칙이 깨지면 실내기 유형이 틀어진다.
//
// 근거·분포: doc/05_설계결정/실내외기_조합_확인표_현업회신_반영_2026-07-16.md §8

import { describe, it, expect } from 'vitest'
import { nodeSeed } from '../../../test/seedFixture'

const singleIndoor = () => {
  const seed = nodeSeed()
  const subs = new Map(seed.subcategories.map((s) => [s.code, s]))
  const series = new Map(seed.series.map((s) => [s.code, s]))

  return seed.products.flatMap((p) => {
    const s = series.get(p.seriesCode)
    if (!s || s.nameKo !== 'SINGLE / Universal') return []
    const sub = subs.get(s.subcategoryCode)
    if (!sub || sub.categoryCode !== 'INDOOR') return []
    return [{ modelCode: p.modelCode, subcategory: sub.nameKo }]
  })
}

describe('단품 실내기 유형 (현업 회신 질문 5)', () => {
  it('B 접두는 덕트형이다 — 우리가 벽걸이형으로 잘못 알았던 것을 현업이 정정했다', () => {
    const b = singleIndoor().filter((p) => p.modelCode.startsWith('B'))
    expect(b.length).toBeGreaterThan(0)
    for (const p of b) expect(p.subcategory).toBe('덕트형')
  })

  it('P 접두는 스탠드형이다', () => {
    for (const p of singleIndoor().filter((x) => x.modelCode.startsWith('P'))) {
      expect(p.subcategory).toBe('스탠드형')
    }
  })

  it('V 접두는 상업용 천장형이다', () => {
    const v = singleIndoor().filter((p) => p.modelCode.startsWith('V'))
    expect(v.length).toBeGreaterThan(0)
    for (const p of v) expect(p.subcategory).toBe('상업용 천장형')
  })

  it('T 접두는 카세트다 — 시트명이 더 구체적이면(듀얼베인·2WAY) 그쪽을 따른다', () => {
    for (const p of singleIndoor().filter((x) => x.modelCode.startsWith('T'))) {
      expect(p.subcategory).toMatch(/카세트/)
    }
  })

  it("단품 실내기가 '기타 실내기'로 뭉쳐 있지 않다", () => {
    expect(singleIndoor().filter((p) => p.subcategory === '기타 실내기')).toEqual([])
  })

  it('분포가 현업 실내기 시리즈 근거자료와 일치한다', () => {
    const count = new Map<string, number>()
    for (const p of singleIndoor()) count.set(p.subcategory, (count.get(p.subcategory) ?? 0) + 1)

    expect(Object.fromEntries(count)).toEqual({
      '천장형 카세트': 72,
      스탠드형: 56,
      '4WAY 카세트(듀얼베인)': 16,
      '상업용 천장형': 4,
      덕트형: 2,
      '2WAY 카세트': 2,
    })
  })
})

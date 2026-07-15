// 계열(energySource)은 시리즈의 속성이다 — 중분류(subcategory)가 아니다.
// 회귀 근거: '기타 실내기(IN_ETC)'는 계열이 제각각인 실내기를 담는 잡동사니 버킷이라,
// 계열을 중분류에 두면 맨 처음 적재된 파일(알파벳순 KR_AWHP…)이 버킷 전체를 AWHP로 물들여
// EHP Multi V 실내기 193대가 AWHP로 오분류됐다(조합표 O/X가 반대로 뒤집힘).
// 근거 조사: 대화 2026-07-15. 계열을 시리즈로 이동해 근본 차단한다.
import { describe, it, expect } from 'vitest'
import { nodeSeed } from '../../../test/seedFixture'

describe('시드 계열(energySource)은 시리즈에 실린다', () => {
  const seed = nodeSeed()
  const serByCode = new Map(seed.series.map((s) => [s.code, s]))
  const esOfModel = (model: string): string | undefined => {
    const p = seed.products.find((x) => x.modelCode === model)
    return p ? serByCode.get(p.seriesCode)?.energySource : undefined
  }

  it('모든 시리즈가 계열 값을 갖는다', () => {
    for (const s of seed.series) {
      expect(s.energySource, `시리즈 ${s.nameKo}(${s.code})에 계열이 없다`).toBeTruthy()
    }
  })

  it('한 중분류에 계열이 다른 시리즈가 공존해도 각자의 계열을 유지한다(IN_ETC 잡동사니 버킷)', () => {
    // 아래 4개 모델은 모두 IN_ETC(기타 실내기)에 담기지만 계열은 EHP다.
    expect(esOfModel('BNW1100M9SR')).toBe('EHP') // SINGLE / Universal 실내기
    expect(esOfModel('RNW0120K2SP')).toBe('EHP') // Multi V S(주거) 실내기
    expect(esOfModel('RNQ0120K2WP')).toBe('EHP') // Smart Multi V S(주거_냉방전용) 실내기
    // 같은 버킷의 AWHP 보일러 실내기는 AWHP로 남아야 한다(버킷이 계열을 강제하지 않는다).
    expect(esOfModel('HNT2502B9A')).toBe('AWHP') // AWHP 싱글 시스템보일러 실내기
  })

  it('EHP Multi V 실내기가 AWHP로 새지 않는다 — INDOOR·EHP 시리즈가 AWHP로 라벨된 게 없다', () => {
    const subByCode = new Map(seed.subcategories.map((s) => [s.code, s]))
    const leaked = seed.series.filter((s) => {
      const sub = subByCode.get(s.subcategoryCode)
      if (sub?.categoryCode !== 'INDOOR') return false
      // Multi V·SINGLE·MVS 계열 실내기(=EHP여야 함)가 AWHP로 찍힌 경우
      return s.energySource === 'AWHP' && /Multi V|SINGLE|MVS|Smart/i.test(s.nameKo)
    })
    expect(leaked.map((s) => s.nameKo)).toEqual([])
  })
})

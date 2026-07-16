import { describe, it, expect } from 'vitest'
import { isRefrigerantCombinableIndoor } from './indoorCombinability'

describe('isRefrigerantCombinableIndoor (실내기 ↔ 냉매식 실외기 조합 가능 여부)', () => {
  it('FCU는 물 기반이라 조합 후보에서 제외한다', () => {
    // 현업 확인 2026-07-16: FCU는 냉·온수 코일이라 Multi V 실외기와 연결 불가, 에이전트에서 제외.
    expect(isRefrigerantCombinableIndoor('FCU(팬코일 유닛)')).toBe(false)
    expect(isRefrigerantCombinableIndoor('FCU')).toBe(false)
    expect(isRefrigerantCombinableIndoor('팬코일 유닛')).toBe(false)
  })

  it('냉매식 실내기(카세트·덕트·벽걸이 등)는 조합 가능하다', () => {
    expect(isRefrigerantCombinableIndoor('4WAY 카세트')).toBe(true)
    expect(isRefrigerantCombinableIndoor('1WAY 카세트')).toBe(true)
    expect(isRefrigerantCombinableIndoor('덕트(고정압)')).toBe(true)
    expect(isRefrigerantCombinableIndoor('벽걸이형')).toBe(true)
    expect(isRefrigerantCombinableIndoor('스탠드형')).toBe(true)
  })
})

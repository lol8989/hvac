import { describe, it, expect } from 'vitest'
import { compatPredicateFromMatrix } from './compatPredicate'
import { CompatMatrix } from '../../domain/equipment/CompatMatrix'

// energySource는 as const로 리터럴 타입을 보존한다(annotation을 붙이면 string으로 넓어져 CompatLabel에 안 맞는다).
const outdoor = [
  { energySource: 'EHP' as const, subcategory: '냉난방 절환형', series: 'Multi V Super 5' },
  { energySource: 'GHP' as const, subcategory: 'GHP', series: 'GHP Super III' },
]
const indoor = [
  { energySource: 'EHP' as const, subcategory: '4WAY 카세트', series: '민수' },
  { energySource: 'EHP' as const, subcategory: '덕트(대공간)', series: '대공간덕트' },
]
// Super5 → [4WAY=O, 대공간=X], GHP → [4WAY=X, 대공간=O]
const matrix = new CompatMatrix(outdoor, indoor, ['OX', 'XO'])
const isCompatible = compatPredicateFromMatrix(matrix)

describe('compatPredicateFromMatrix', () => {
  it('조합표 O면 연결 가능, X면 불가', () => {
    expect(isCompatible(outdoor[0], indoor[0])).toBe(true) // Super5×4WAY=O
    expect(isCompatible(outdoor[0], indoor[1])).toBe(false) // Super5×대공간=X
  })

  it('계열이 달라도 조합표 O면 연결 가능 (GHP↔대공간덕트)', () => {
    expect(isCompatible(outdoor[1], indoor[1])).toBe(true) // GHP×대공간=O (EHP 실내기지만)
    expect(isCompatible(outdoor[1], indoor[0])).toBe(false) // GHP×4WAY=X
  })

  it('조합표에 없는 축은 계열로 폴백한다', () => {
    const unknownOutdoor = { energySource: 'EHP' as const, subcategory: '없음', series: '없음' }
    const ehpIndoor = { energySource: 'EHP' as const, subcategory: '?', series: '?' }
    const ghpIndoor = { energySource: 'GHP' as const, subcategory: '?', series: '?' }
    expect(isCompatible(unknownOutdoor, ehpIndoor)).toBe(true) // 계열 일치
    expect(isCompatible(unknownOutdoor, ghpIndoor)).toBe(false) // 계열 불일치
  })

  it('라벨이 비면 계열로 폴백한다', () => {
    expect(isCompatible({ energySource: 'EHP' }, { energySource: 'EHP' })).toBe(true)
    expect(isCompatible({ energySource: 'EHP' }, { energySource: 'GHP' })).toBe(false)
  })
})

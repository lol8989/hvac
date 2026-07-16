import { describe, it, expect } from 'vitest'
import { CompatMatrix, type CompatAxis } from './CompatMatrix'

const outdoor: CompatAxis[] = [
  { energySource: 'EHP', subcategory: '냉난방 절환형', series: 'Multi V Super 5(고급형)' },
  { energySource: 'GHP', subcategory: 'GHP', series: 'GHP Super III' },
]
const indoor: CompatAxis[] = [
  { energySource: 'EHP', subcategory: '4WAY 카세트', series: 'Multi V 실내기(민수전용)' },
  { energySource: 'EHP', subcategory: '덕트(대공간)', series: 'Multi V 실내기(대공간덕트)' },
]
// 행 순서 × 열 순서. Super5 → [4WAY=O, 대공간덕트=X], GHP → [4WAY=X, 대공간덕트=O]
const make = () => new CompatMatrix(outdoor, indoor, ['OX', 'XO'])

describe('CompatMatrix', () => {
  it('행·열 축과 셀 값을 그대로 노출한다', () => {
    const m = make()
    expect(m.outdoorRows).toHaveLength(2)
    expect(m.indoorColumns).toHaveLength(2)
    expect(m.valueAt(outdoor[0], indoor[0])).toBe('O')
    expect(m.valueAt(outdoor[0], indoor[1])).toBe('X')
    expect(m.valueAt(outdoor[1], indoor[1])).toBe('O')
  })

  it('isCompatible은 O·D면 true, X·-면 false', () => {
    const m = new CompatMatrix(outdoor, indoor, ['OD', 'X-'])
    expect(m.isCompatible(outdoor[0], indoor[0])).toBe(true) // O
    expect(m.isCompatible(outdoor[0], indoor[1])).toBe(true) // D(전용 제품도 연결 가능)
    expect(m.isCompatible(outdoor[1], indoor[0])).toBe(false) // X
    expect(m.isCompatible(outdoor[1], indoor[1])).toBe(false) // -(멀티 대상 아님)
  })

  it('축이 (중분류,시리즈)로 식별된다 — 같은 시리즈명도 중분류가 다르면 다른 축', () => {
    const out2: CompatAxis[] = [
      { energySource: 'EHP', subcategory: '냉난방 절환형', series: 'Multi V S' },
      { energySource: 'EHP', subcategory: '냉방전용', series: 'Multi V S' }, // 같은 시리즈명, 다른 중분류
    ]
    const m = new CompatMatrix(out2, indoor, ['OO', 'XX'])
    expect(m.valueAt(out2[0], indoor[0])).toBe('O')
    expect(m.valueAt(out2[1], indoor[0])).toBe('X')
  })

  it('withValue는 원본을 두고 새 매트릭스를 반환한다(불변)', () => {
    const m = make()
    const m2 = m.withValue(outdoor[0], indoor[1], 'O')
    expect(m2.valueAt(outdoor[0], indoor[1])).toBe('O')
    expect(m.valueAt(outdoor[0], indoor[1])).toBe('X') // 원본 불변
    expect(m2).not.toBe(m)
  })

  it('withValue는 대상 칸만 바꾸고 나머지 칸은 그대로 둔다', () => {
    const m = make() // Super5 → [4WAY=O, 대공간덕트=X], GHP → [4WAY=X, 대공간덕트=O]
    const m2 = m.withValue(outdoor[0], indoor[1], 'D') // Super5 × 대공간덕트만 X→D
    expect(m2.valueAt(outdoor[0], indoor[1])).toBe('D')
    // 나머지 세 칸은 불변
    expect(m2.valueAt(outdoor[0], indoor[0])).toBe('O')
    expect(m2.valueAt(outdoor[1], indoor[0])).toBe('X')
    expect(m2.valueAt(outdoor[1], indoor[1])).toBe('O')
  })

  it('중복 축(같은 중분류·시리즈)이면 생성 시 throw한다', () => {
    const dupCols: CompatAxis[] = [
      { energySource: 'EHP', subcategory: '4WAY 카세트', series: 'Multi V 실내기(민수전용)' },
      { energySource: 'EHP', subcategory: '4WAY 카세트', series: 'Multi V 실내기(민수전용)' }, // 중복
    ]
    expect(() => new CompatMatrix(outdoor, dupCols, ['OX', 'XO'])).toThrow()
  })

  it('축 라벨에 예약 구분자가 섞이면 생성 시 throw한다', () => {
    const badCols: CompatAxis[] = [
      { energySource: 'EHP', subcategory: `4WAY␟카세트`, series: 'S' }, // 구분자 U+241F 포함
      indoor[1],
    ]
    expect(() => new CompatMatrix(outdoor, badCols, ['OX', 'XO'])).toThrow()
  })

  it('알 수 없는 축을 조회하면 throw한다', () => {
    const m = make()
    expect(() => m.valueAt({ subcategory: '없음', series: '없음' }, indoor[0])).toThrow()
  })

  it('values 행 개수·길이가 축과 안 맞으면 생성 시 throw한다', () => {
    expect(() => new CompatMatrix(outdoor, indoor, ['OX'])).toThrow() // 행 부족
    expect(() => new CompatMatrix(outdoor, indoor, ['OX', 'X'])).toThrow() // 열 길이 불일치
    expect(() => new CompatMatrix(outdoor, indoor, ['OX', 'XZ'])).toThrow() // 잘못된 값 문자
  })
})

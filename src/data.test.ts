import { describe, it, expect } from 'vitest'
import { recommendedIndoorIdx, outdoorIdxByModel, ratioOf, indoorCoolByModel, MODELS } from './data'
import type { ModelCard } from './data'

// 부하 근사 매칭용 목업 카드(용량만 의미 있음)
const cards: ModelCard[] = [
  { mn: 'A', ms: '', mp: '', md: '', on: false, cool: 2.64 },
  { mn: 'B', ms: '', mp: '', md: '', on: false, cool: 4.0 },
  { mn: 'C', ms: '', mp: '', md: '', on: false, cool: 6.0 },
]

describe('recommendedIndoorIdx (냉방부하 근사 매칭)', () => {
  it('부하와 정확히 일치하는 용량이 있으면 그 카드를 고른다', () => {
    expect(recommendedIndoorIdx(4.0, cards)).toBe(1)
  })

  it('정확히 일치하지 않으면 가장 가까운 용량을 고른다', () => {
    expect(recommendedIndoorIdx(5.6, cards)).toBe(2) // 6.0이 4.0보다 가까움
    expect(recommendedIndoorIdx(3.5, cards)).toBe(1) // 4.0(0.5)이 2.64(0.86)보다 가까움
    expect(recommendedIndoorIdx(3.0, cards)).toBe(0) // 2.64(0.36)가 4.0(1.0)보다 가까움
  })

  it('중간(동률)이면 더 큰 용량을 우선한다', () => {
    expect(recommendedIndoorIdx(5.0, cards)).toBe(2) // 4.0/6.0 동률 → 6.0
  })

  it('부하가 최대 용량을 초과하면 최대 카드를 고른다', () => {
    expect(recommendedIndoorIdx(30, cards)).toBe(2)
  })

  it('기본 카탈로그(MODELS.in)로도 유효한 인덱스를 반환한다', () => {
    const idx = recommendedIndoorIdx(9.0)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(MODELS.in.length)
  })
})

describe('indoorCoolByModel (모델명 → 정격 냉방용량)', () => {
  it('존재하는 모델은 그 용량을 반환', () => {
    const m = MODELS.in[2]
    expect(indoorCoolByModel(m.mn)).toBe(m.cool)
  })
  it('미지정(undefined)/미매칭은 0', () => {
    expect(indoorCoolByModel(undefined)).toBe(0)
    expect(indoorCoolByModel('NON_EXISTENT')).toBe(0)
  })
})

describe('ratioOf (조합비 = Σ실내기 정격 ÷ 실외기 용량)', () => {
  const group = { items: ['R1', 'R2'], cool: 20 }
  it('capByRoom(B: 선택 장비 기준)로 합산한다', () => {
    expect(ratioOf(group, { R1: 6, R2: 4 })).toBeCloseTo(0.5) // (6+4)/20
  })
  it('capByRoom에 없는 실은 0으로 취급(미설치)', () => {
    expect(ratioOf(group, { R1: 6 })).toBeCloseTo(0.3) // (6+0)/20
  })
  it('실외기 용량 0이면 0(division 방지)', () => {
    expect(ratioOf({ items: ['R1'], cool: 0 }, { R1: 6 })).toBe(0)
  })
})

describe('outdoorIdxByModel (그룹 실외기 → 카드 하이라이트)', () => {
  it('모델 코드가 카드 목록에 있으면 그 인덱스를 반환한다', () => {
    const model = MODELS.out[1].mn
    expect(outdoorIdxByModel(model)).toBe(1)
  })

  it('목록에 없는 모델이면 -1을 반환한다', () => {
    expect(outdoorIdxByModel('NON_EXISTENT_MODEL')).toBe(-1)
  })
})

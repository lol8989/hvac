// 조합비 정책 (주인님 확정 2026-07-10: 전역 기본 50~103%, 실외기 모델별 override).
import { describe, it, expect } from 'vitest'
import { ComboRange } from '../shared/ComboRange'
import { ComboPolicy } from './ComboPolicy'

const global = new ComboRange(0.5, 1.03)

describe('ComboRange.DEFAULT', () => {
  // 근거: Confluence 자동배치 룰 — "목표 100%, 허용 50% ~ 103%".
  it('전역 기본은 0.5 ~ 1.03이다', () => {
    expect(ComboRange.DEFAULT.min).toBe(0.5)
    expect(ComboRange.DEFAULT.max).toBe(1.03)
  })
})

describe('ComboPolicy.rangeFor — 우선순위: 모델별 override > 전역 기본', () => {
  it('override가 없으면 전역 기본을 쓴다', () => {
    const p = new ComboPolicy(global, new Map())
    expect(p.rangeFor('RPUW281X9P').equals(global)).toBe(true)
  })

  it('override가 있으면 그 값을 쓴다', () => {
    const ghp = new ComboRange(0.5, 1.2)
    const p = new ComboPolicy(global, new Map([['GPUW280C2S', ghp]]))
    expect(p.rangeFor('GPUW280C2S').equals(ghp)).toBe(true)
    expect(p.rangeFor('RPUW281X9P').equals(global)).toBe(true) // 다른 모델은 영향 없음
  })

  it('모델명 비교는 대소문자·공백에 흔들리지 않는다', () => {
    const p = new ComboPolicy(global, new Map([['GPUW280C2S', new ComboRange(0.4, 1.2)]]))
    expect(p.rangeFor('  gpuw280c2s ').max).toBe(1.2)
  })
})

describe('ComboPolicy.with — 불변 갱신', () => {
  it('override를 추가해도 원본은 그대로다', () => {
    const p = new ComboPolicy(global, new Map())
    const next = p.with('GPUW280C2S', new ComboRange(0.6, 1.1))
    expect(next.rangeFor('GPUW280C2S').max).toBe(1.1)
    expect(p.rangeFor('GPUW280C2S').max).toBe(1.03) // 원본 불변
  })

  it('null을 주면 override를 걷어내고 전역 기본으로 되돌린다', () => {
    const p = new ComboPolicy(global, new Map([['GPUW280C2S', new ComboRange(0.6, 1.1)]]))
    expect(p.with('GPUW280C2S', null).rangeFor('GPUW280C2S').equals(global)).toBe(true)
  })

  it('전역 기본을 바꾸면 override 없는 모델에만 반영된다', () => {
    const p = new ComboPolicy(global, new Map([['A', new ComboRange(0.6, 1.1)]]))
    const next = p.withGlobal(new ComboRange(0.5, 1.3))
    expect(next.rangeFor('B').max).toBe(1.3)
    expect(next.rangeFor('A').max).toBe(1.1) // override 유지
  })
})

describe('ComboPolicy — 자기검증', () => {
  it('min < max가 깨지면 ComboRange 생성 단계에서 막힌다', () => {
    expect(() => new ComboRange(1.2, 1.0)).toThrow()
    expect(() => new ComboRange(0, 1.0)).toThrow()
  })

  it('overrides는 외부에서 변형할 수 없다', () => {
    const src = new Map([['A', new ComboRange(0.6, 1.1)]])
    const p = new ComboPolicy(global, src)
    src.set('A', new ComboRange(0.1, 9)) // 원본 Map을 흔들어도
    expect(p.rangeFor('A').max).toBe(1.1) // 정책은 그대로
  })
})

// recommendIndoor 단위 테스트 (TDD).
// 근거: 표준 260415 장비선정표 엑셀 — 실별 필요 냉방부하(W)에 대한 실내기 모델·대수 선정.

import { describe, it, expect } from 'vitest'
import { IndoorModel } from './IndoorModel'
import { recommendIndoor } from './recommendIndoor'

// 테스트용 모델 생성 헬퍼 (난방용량은 실측 비율 근사 ×1.12 목업)
const make = (code: string, coolW: number): IndoorModel =>
  new IndoorModel({
    code,
    model: `M-${code}`,
    coolW,
    heatW: coolW * 1.12,
    type: '4WAY 카세트',
    energySource: 'EHP',
  })

// 시드 16종과 동일한 코드·냉방용량 (InMemoryIndoorModelCatalog 참조)
const CATALOG16: readonly IndoorModel[] = [
  make('20C', 2000),
  make('23C', 2300),
  make('32C', 3200),
  make('40C', 4000),
  make('52C', 5200),
  make('60C', 6000),
  make('72C', 7200),
  make('40T', 4000),
  make('52T', 5200),
  make('60T', 6000),
  make('72T', 7200),
  make('83T', 8300),
  make('100T', 10000),
  make('110T', 11000),
  make('130T', 13000),
  make('145T', 14500),
]

const byCodes = (codes: readonly string[]): readonly IndoorModel[] =>
  codes.map((c) => {
    const found = CATALOG16.find((m) => m.code === c)
    if (!found) throw new Error(`테스트 셋업 오류: ${c} 없음`)
    return found
  })

describe('recommendIndoor', () => {
  it('3255.8W이면 16종 카탈로그에서 32C 1대를 추천한다 (score 55.8이 최소)', () => {
    const result = recommendIndoor(3255.8, CATALOG16)
    expect(result).toEqual({ modelCode: '32C', quantity: 1 })
  })

  it('20407W이면 72 용량대에서 3대를 추천하고, score 동률이면 목록 앞의 72C를 고른다', () => {
    // 23C(×9, score 293)·52C(×4, score 393) 등 더 근접한 모델을 제외한 목록에서
    // 72C×3 = 21600 (score 1193)이 최소가 되는 시나리오
    const models = byCodes(['60C', '72C', '72T', '83T', '110T'])
    const result = recommendIndoor(20407, models)
    expect(result).toEqual({ modelCode: '72C', quantity: 3 })
  })

  it('941.9W(엑셀 준비실)이면 최소 용량 모델 1대를 추천한다 (대수는 최소 1)', () => {
    const result = recommendIndoor(941.9, CATALOG16)
    expect(result).toEqual({ modelCode: '20C', quantity: 1 })
  })

  it('아주 큰 부하(50000W)를 단일 모델로 감당하면 대수가 ceil로 커진다', () => {
    const result = recommendIndoor(50000, byCodes(['72C']))
    expect(result).toEqual({ modelCode: '72C', quantity: Math.ceil(50000 / 7200) }) // 7대
  })

  it('score가 동률이면 대수가 적은 모델을 고른다', () => {
    // 6000W: X3×2(score 0) vs X6×1(score 0) → 대수 적은 X6 (목록 뒤에 있어도)
    const result = recommendIndoor(6000, [make('X3', 3000), make('X6', 6000)])
    expect(result).toEqual({ modelCode: 'X6', quantity: 1 })
  })

  it('score와 대수가 모두 동률이면 목록 앞의 모델을 고른다 (결정론)', () => {
    // 40C·40T는 냉방용량 4000W로 동일 → 목록 순서가 결과를 결정한다
    expect(recommendIndoor(4000, byCodes(['40C', '40T']))).toEqual({
      modelCode: '40C',
      quantity: 1,
    })
    expect(recommendIndoor(4000, byCodes(['40T', '40C']))).toEqual({
      modelCode: '40T',
      quantity: 1,
    })
  })

  it('requiredCoolW가 0이면 예외를 던진다', () => {
    expect(() => recommendIndoor(0, CATALOG16)).toThrow()
  })

  it('requiredCoolW가 음수이면 예외를 던진다', () => {
    expect(() => recommendIndoor(-100, CATALOG16)).toThrow()
  })

  it('requiredCoolW가 NaN이면 예외를 던진다', () => {
    expect(() => recommendIndoor(NaN, CATALOG16)).toThrow()
  })

  it('requiredCoolW가 Infinity이면 예외를 던진다', () => {
    expect(() => recommendIndoor(Infinity, CATALOG16)).toThrow()
  })

  it('models가 빈 배열이면 예외를 던진다', () => {
    expect(() => recommendIndoor(3000, [])).toThrow()
  })

  it('반환된 선정 결과는 불변이다 (Object.freeze)', () => {
    const result = recommendIndoor(3255.8, CATALOG16)
    expect(Object.isFrozen(result)).toBe(true)
  })
})

// 일람표 값 변환기 — 스펙시트 원문을 일람표 표기로 옮긴다.
// 원문은 product_specs에 그대로 두고(SSOT), 출력할 때만 변환한다(주인님 확정 2026-07-10).
// 근거: doc/05_설계결정/일람표_컬럼_매핑표.md §2·§4
import { describe, it, expect } from 'vitest'
import { firstNumber, firstOf, maxOf, powerSupply, dimensions, wireSpec, breaker, toKw, DASH } from './scheduleFormat'

// 일람표 소비전력 컬럼은 kW다. 그런데 실내기는 W, 실외기는 kW로 저장돼 있다 → 단위를 봐야 한다.
describe('toKw — 단위를 보고 kW로 맞춘다', () => {
  it('W로 저장된 값은 kW로 환산한다', () => {
    expect(toKw({ value: '11 / - / -', unit: 'W' })).toBe('0.011')
    expect(toKw({ value: '30', unit: 'W' })).toBe('0.03')
  })

  it('이미 kW면 그대로', () => {
    expect(toKw({ value: '1.7', unit: 'kW' })).toBe('1.7')
  })

  it('강/중/약이면 최댓값을 쓴다', () => {
    expect(toKw({ value: '11 / 9 / 7', unit: 'W' })).toBe('0.011')
  })

  it('단위를 모르면 값 그대로 둔다 (지어내지 않는다)', () => {
    expect(toKw({ value: '1.7', unit: null })).toBe('1.7')
  })

  it('없으면 대시', () => {
    expect(toKw(null)).toBe(DASH)
    expect(toKw({ value: '-', unit: 'W' })).toBe(DASH)
  })
})

describe('firstNumber — 기호·괄호가 붙은 값에서 숫자만 뽑는다', () => {
  it('배관구경', () => {
    expect(firstNumber('Φ6.35 (1/4)')).toBe('6.35')
    expect(firstNumber('Φ12.7 (1/2)')).toBe('12.7')
    expect(firstNumber('19.05')).toBe('19.05')
    expect(firstNumber('31.2 (Hose)')).toBe('31.2')
  })

  it('공백 천단위 구분을 흡수한다', () => {
    expect(firstNumber('2 607')).toBe('2607')
  })

  it('숫자가 없으면 대시', () => {
    expect(firstNumber('R 3/4 (수나사)')).toBe('3') // 분수의 첫 숫자
    expect(firstNumber('-')).toBe(DASH)
    expect(firstNumber('')).toBe(DASH)
    expect(firstNumber(null)).toBe(DASH)
  })
})

describe('firstOf — 슬래시로 나뉜 값의 첫 항목', () => {
  it('드레인 외경/내경에서 외경만', () => {
    expect(firstOf('32 / 25')).toBe('32')
  })

  it('빈 값·대시는 대시', () => {
    expect(firstOf('-')).toBe(DASH)
    expect(firstOf(null)).toBe(DASH)
  })
})

describe('maxOf — 강/중/약 중 최댓값', () => {
  it('풍량은 가장 큰 값을 쓴다', () => {
    expect(maxOf('- / 7.6 / 7.1 / 6.2')).toBe('7.6')
    expect(maxOf('34/30/28')).toBe('34')
    expect(maxOf('11 / - / -')).toBe('11')
  })

  it('숫자가 하나도 없으면 대시', () => {
    expect(maxOf('- / - / -')).toBe(DASH)
    expect(maxOf(null)).toBe(DASH)
  })
})

describe('powerSupply — 전원 표기를 일람표 순서로 재배열', () => {
  // 스펙시트: "220, 1상(2선), 60"  →  일람표: "1, 2, 220, 60" (상, 선식, V, Hz)
  it('상·선식·전압·주파수 순으로 옮긴다', () => {
    expect(powerSupply('220, 1상(2선), 60')).toBe('1, 2, 220, 60')
    expect(powerSupply('380, 3상(4선), 60')).toBe('3, 4, 380, 60')
  })

  // 시트마다 전원 표기가 다르다. 일부는 이미 일람표 순서인데 구분자만 슬래시다
  // ('전 원 = 3 / 4 / 380 / 60', 단위 '상/선식/V/Hz').
  it('이미 상·선식·V·Hz 순인 슬래시 표기는 구분자만 바꾼다', () => {
    expect(powerSupply('3 / 4 / 380 / 60')).toBe('3, 4, 380, 60')
    expect(powerSupply('1 / 2 / 220 / 60')).toBe('1, 2, 220, 60')
  })

  it('원문 형식이 다르면 원문을 그대로 둔다 (값을 지어내지 않는다)', () => {
    expect(powerSupply('220V 단상')).toBe('220V 단상')
    expect(powerSupply('3 / 4 / 380')).toBe('3 / 4 / 380') // 항목 수가 다르면 손대지 않는다
    expect(powerSupply(null)).toBe(DASH)
  })
})

describe('dimensions — 치수 표기 정리', () => {
  it('공백 천단위와 구분자를 정리한다', () => {
    expect(dimensions('860 x 132 x 450')).toBe('860x132x450')
    expect(dimensions('1 880 x 2 180 x 960')).toBe('1880x2180x960')
    expect(dimensions('1,050x330x1,050')).toBe('1050x330x1050')
  })

  it('없으면 대시', () => {
    expect(dimensions(null)).toBe(DASH)
  })
})

describe('wireSpec — 전선 표기 정리', () => {
  it('× 를 x 로, 공백을 정리한다', () => {
    expect(wireSpec('2.5 × 3')).toBe('2.5x3C')
    expect(wireSpec('0.75 ~ 1.5 × 2')).toBe('0.75~1.5x2C')
  })

  it('없으면 대시', () => {
    expect(wireSpec(null)).toBe(DASH)
  })
})

describe('breaker — 누전차단기 규격', () => {
  it('숫자에 A를 붙인다', () => {
    expect(breaker('15')).toBe('15A')
    expect(breaker('30')).toBe('30A')
  })

  it('이미 A가 붙었으면 그대로', () => {
    expect(breaker('16A')).toBe('16A')
  })

  it('없으면 대시', () => {
    expect(breaker(null)).toBe(DASH)
    expect(breaker('-')).toBe(DASH)
  })
})

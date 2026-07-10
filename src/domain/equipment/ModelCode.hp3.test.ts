// 100HP 이상 모델 오독 회귀 고정 (2026-07-10).
//
// 모델명 숫자 블록의 마지막 자리는 HP가 아니라 변형 코드인데, 그 코드가 숫자일 수도 문자일 수도 있다.
//   RPUW281X9P  → 블록 '281'  → 28HP + 변형 '1'
//   RP-Q1001X9S → 블록 '1001' → 100HP + 변형 '1'
//   RP-Q100PX9S → 블록 '100'  → 100HP + 변형 'P'(문자)
// 블록 길이만으로는 28HP와 100HP를 가를 수 없다. 냉방용량 환산이 유일한 판별 근거다.
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md §4
import { describe, it, expect } from 'vitest'
import { horsepowerFromModelCode } from './ModelCode'

describe('horsepowerFromModelCode — 냉방용량으로 100HP대를 판별한다', () => {
  it('블록 4자리 100HP대 모델을 10HP로 읽지 않는다', () => {
    expect(horsepowerFromModelCode('RP-Q1001X9S', 280600)).toBe(100)
    expect(horsepowerFromModelCode('RP-Q1021X9S', 285900)).toBe(102)
    expect(horsepowerFromModelCode('RP-Q1041X9S', 291200)).toBe(104)
    expect(horsepowerFromModelCode('RP-W1001X9H', 286200)).toBe(100)
    expect(horsepowerFromModelCode('RP-W1021X9H', 294300)).toBe(102)
    expect(horsepowerFromModelCode('RP-W1041X9H', 302400)).toBe(104)
  })

  it('변형 코드가 문자라 블록이 3자리인 100HP대 변종도 판별한다', () => {
    expect(horsepowerFromModelCode('RP-Q100PX9S', 280600)).toBe(100)
    expect(horsepowerFromModelCode('RP-W100BX9P', 280600)).toBe(100)
    expect(horsepowerFromModelCode('RP-W104BX9P', 291200)).toBe(104)
  })

  it('2자리 HP 모델은 냉방용량을 줘도 그대로 읽는다 (3자리 후보 기각)', () => {
    expect(horsepowerFromModelCode('RPUW281X9P', 78400)).toBe(28)
    expect(horsepowerFromModelCode('GP-W560C2S', 164000)).toBe(56)
    expect(horsepowerFromModelCode('RPUQ141X9S', 39200)).toBe(14)
  })

  it('냉방용량이 없으면 앞 두 자리를 읽는다 (기존 동작 유지)', () => {
    expect(horsepowerFromModelCode('RP-Q1001X9S')).toBe(10)
    expect(horsepowerFromModelCode('RPUW281X9P')).toBe(28)
  })

  it('냉방용량이 모델명과 모순되면 용량 쪽을 믿는다', () => {
    // 블록은 100HP를 시사하지만 용량이 10HP급이면 10HP.
    expect(horsepowerFromModelCode('RP-Q1001X9S', 29070)).toBe(10)
  })

  it('3자리 후보는 100~199 범위에서만 인정한다', () => {
    expect(horsepowerFromModelCode('RPUW001X9P', 2907)).toBeNull() // 001 → 1HP 아님, 00 무효
    expect(horsepowerFromModelCode('GP-W560C2S', 1628000)).toBe(56) // 560HP 후보 기각(범위 밖)
  })
})

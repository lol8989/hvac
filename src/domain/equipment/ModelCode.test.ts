// 실외기 HP는 스펙시트에 없고 모델명이 인코딩한다(주인님 결정 2026-07-09).
// 근거: 03_참고자료/LG전자 스펙시트 모음 50개 파일, 실외기 493모델 전수 확인.
import { describe, it, expect } from 'vitest'
import { horsepowerFromModelCode } from './ModelCode'

describe('horsepowerFromModelCode (모델명 → 마력)', () => {
  it('접두 알파벳 뒤 첫 두 자리가 HP다', () => {
    expect(horsepowerFromModelCode('RPUW281X9P')).toBe(28)
    expect(horsepowerFromModelCode('RPUW301X9P')).toBe(30)
    expect(horsepowerFromModelCode('GPUW280C2S')).toBe(28)
  })

  it('선행 0은 한 자리 HP다 (RPUB081X9E = 8HP)', () => {
    expect(horsepowerFromModelCode('RPUB081X9E')).toBe(8)
  })

  it('하이픈이 섞인 접두도 처리한다 (RP-B261X9E = 26HP)', () => {
    expect(horsepowerFromModelCode('RP-B261X9E')).toBe(26)
    expect(horsepowerFromModelCode('GP-W560C2S')).toBe(56) // 280×2 조합 모델
    expect(horsepowerFromModelCode('RP-B881X9E')).toBe(88)
  })

  it('세대 문자가 숫자 자리에 와도 앞 두 자리만 읽는다 (RPUW12BX9M = 12HP — 시드와 일치)', () => {
    expect(horsepowerFromModelCode('RPUW12BX9M')).toBe(12)
  })

  it('공백·소문자를 허용한다', () => {
    expect(horsepowerFromModelCode('  rpuw281x9p ')).toBe(28)
  })

  it('추출 불가능하면 null (샤시명·빈 문자열·숫자 없음)', () => {
    expect(horsepowerFromModelCode('UXB')).toBeNull()
    expect(horsepowerFromModelCode('')).toBeNull()
    expect(horsepowerFromModelCode('   ')).toBeNull()
    expect(horsepowerFromModelCode('RPUW1')).toBeNull() // 두 자리 미만
  })

  it('숫자로 시작하는 코드는 접두가 없어 null (오인식 방지)', () => {
    expect(horsepowerFromModelCode('281X9P')).toBeNull()
  })

  it('현실적 HP 범위(1~99)를 벗어나면 null', () => {
    expect(horsepowerFromModelCode('RPUW001X9P')).toBeNull() // 00HP
  })
})

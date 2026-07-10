import { describe, it, expect } from 'vitest'
import { ComboRatio, COMBO_MIN, COMBO_MAX } from './ComboRatio'
import { ComboRange } from './ComboRange'

describe('ComboRatio (조합비 값객체)', () => {
  it('연결 실내기 합 / 실외기 용량으로 조합비를 계산한다', () => {
    expect(new ComboRatio(24.7, 34.8).toFixed(2)).toBe('0.71')
  })

  it('권장 범위(0.5~1.3) 안이면 isWithinRange=true', () => {
    expect(new ComboRatio(20, 30).isWithinRange).toBe(true)
  })

  it('경계값 0.5, 1.3은 범위에 포함된다', () => {
    expect(new ComboRatio(COMBO_MIN * 30, 30).isWithinRange).toBe(true)
    expect(new ComboRatio(COMBO_MAX * 30, 30).isWithinRange).toBe(true)
  })

  it('1.3 초과는 과부하(isOverloaded)로 판정한다', () => {
    const r = new ComboRatio(40, 30)
    expect(r.isOverloaded).toBe(true)
    expect(r.isWithinRange).toBe(false)
  })

  it('0.5 미만은 저부하(isUnderloaded)로 판정한다', () => {
    expect(new ComboRatio(10, 30).isUnderloaded).toBe(true)
  })

  it('fromRooms로 방 배열에서 생성한다', () => {
    const r = ComboRatio.fromRooms([{ cool: 11.2 }, { cool: 9.0 }, { cool: 4.5 }], 34.8)
    expect(r.toFixed(2)).toBe('0.71')
  })

  describe('judgeWith — 제품군별 허용범위로 판정한다', () => {
    const range = new ComboRange(0.3, 1.0)

    it('범위 미만이면 UNDERLOADED를 반환한다', () => {
      expect(new ComboRatio(29, 100).judgeWith(range)).toBe('UNDERLOADED') // 0.29
    })

    it('범위 안이면 OK를 반환한다 (경계값 min/max 포함)', () => {
      expect(new ComboRatio(30, 100).judgeWith(range)).toBe('OK') // 0.30
      expect(new ComboRatio(100, 100).judgeWith(range)).toBe('OK') // 1.00
      expect(new ComboRatio(32, 100).judgeWith(range)).toBe('OK') // 0.32 (DOAS 실데이터)
    })

    it('범위 초과이면 OVERLOADED를 반환한다', () => {
      expect(new ComboRatio(101, 100).judgeWith(range)).toBe('OVERLOADED') // 1.01
    })

    it('DEFAULT(0.5~1.03) 경계에서 3분기한다', () => {
      expect(new ComboRatio(100, 100).judgeWith(ComboRange.DEFAULT)).toBe('OK') // 목표 100%
      expect(new ComboRatio(103, 100).judgeWith(ComboRange.DEFAULT)).toBe('OK') // 상한 경계
      expect(new ComboRatio(49, 100).judgeWith(ComboRange.DEFAULT)).toBe('UNDERLOADED')
      expect(new ComboRatio(104, 100).judgeWith(ComboRange.DEFAULT)).toBe('OVERLOADED')
    })

    // 실데이터의 GHP 1.106은 선정표에 '정상'으로 기재돼 있으나 전역 기본(1.03)을 넘는다.
    // 이것이 모델별 override가 필요한 이유다 — 전역 기본을 GHP에 맞춰 늘리면 EHP가 헐거워진다.
    it('GHP 1.106은 전역 기본에서 과부하지만, 모델별 override로 정상이 된다', () => {
      expect(new ComboRatio(110.6, 100).judgeWith(ComboRange.DEFAULT)).toBe('OVERLOADED')
      expect(new ComboRatio(110.6, 100).judgeWith(new ComboRange(0.5, 1.12))).toBe('OK')
    })
  })

  // ─── 적대적 QA: 잘못된 입력·불변성 방어 ───
  it('[적대] 실외기 용량이 0이면 예외', () => {
    expect(() => new ComboRatio(10, 0)).toThrow()
  })

  it('[적대] 음수 용량이면 예외', () => {
    expect(() => new ComboRatio(-1, 30)).toThrow()
    expect(() => new ComboRatio(10, -30)).toThrow()
  })

  it('[적대] 숫자가 아니거나 NaN이면 예외', () => {
    // @ts-expect-error 잘못된 타입 주입 — 런타임 가드 검증
    expect(() => new ComboRatio('10', 30)).toThrow()
    expect(() => new ComboRatio(NaN, 30)).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const r = new ComboRatio(20, 30)
    expect(() => {
      // @ts-expect-error 불변(freeze) 위반은 런타임에서 차단
      r.value = 999
    }).toThrow()
  })
})

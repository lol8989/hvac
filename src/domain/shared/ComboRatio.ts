// 조합비 값객체 (Shared Kernel · Value Object).
// 불변 + 자기검증. 조합비 = Σ(연결 실내기 냉방용량 kW) / 실외기 용량 kW.
// Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

import { ComboRange } from './ComboRange'

// 하위호환 상수 — 기본 범위는 ComboRange.DEFAULT가 SSOT.
export const COMBO_MIN = ComboRange.DEFAULT.min
export const COMBO_MAX = ComboRange.DEFAULT.max

export type ComboJudgement = 'UNDERLOADED' | 'OK' | 'OVERLOADED'

export class ComboRatio {
  readonly indoorTotalKw: number
  readonly outdoorKw: number
  readonly value: number

  constructor(indoorTotalKw: number, outdoorKw: number) {
    if (typeof indoorTotalKw !== 'number' || Number.isNaN(indoorTotalKw) || indoorTotalKw < 0) {
      throw new Error('indoorTotalKw는 0 이상의 숫자여야 합니다')
    }
    if (typeof outdoorKw !== 'number' || Number.isNaN(outdoorKw) || outdoorKw <= 0) {
      throw new Error('outdoorKw는 0보다 큰 숫자여야 합니다')
    }
    this.indoorTotalKw = indoorTotalKw
    this.outdoorKw = outdoorKw
    this.value = indoorTotalKw / outdoorKw
    Object.freeze(this)
  }

  get isWithinRange(): boolean {
    return this.judgeWith(ComboRange.DEFAULT) === 'OK'
  }

  get isOverloaded(): boolean {
    return this.judgeWith(ComboRange.DEFAULT) === 'OVERLOADED'
  }

  get isUnderloaded(): boolean {
    return this.judgeWith(ComboRange.DEFAULT) === 'UNDERLOADED'
  }

  // 제품군별 허용범위(ComboRange)로 3분기 판정.
  judgeWith(range: ComboRange): ComboJudgement {
    if (this.value < range.min) return 'UNDERLOADED'
    if (this.value > range.max) return 'OVERLOADED'
    return 'OK'
  }

  toFixed(digits = 2): string {
    return this.value.toFixed(digits)
  }

  // 연결 실내기 목록({ cool })과 실외기 용량으로 생성.
  static fromRooms(rooms: ReadonlyArray<{ cool?: number }>, outdoorKw: number): ComboRatio {
    const total = rooms.reduce((sum, r) => sum + (r.cool || 0), 0)
    return new ComboRatio(total, outdoorKw)
  }
}

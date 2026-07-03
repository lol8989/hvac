// 조합비 값객체 (Shared Kernel · Value Object).
// 불변 + 자기검증. 조합비 = Σ(연결 실내기 냉방용량 kW) / 실외기 용량 kW.
// Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

export const COMBO_MIN = 0.5
export const COMBO_MAX = 1.3

export class ComboRatio {
  constructor(indoorTotalKw, outdoorKw) {
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

  get isWithinRange() {
    return this.value >= COMBO_MIN && this.value <= COMBO_MAX
  }

  get isOverloaded() {
    return this.value > COMBO_MAX
  }

  get isUnderloaded() {
    return this.value < COMBO_MIN
  }

  toFixed(digits = 2) {
    return this.value.toFixed(digits)
  }

  // 연결 실내기 목록({ cool })과 실외기 용량으로 생성.
  static fromRooms(rooms, outdoorKw) {
    const total = rooms.reduce((sum, r) => sum + (r.cool || 0), 0)
    return new ComboRatio(total, outdoorKw)
  }
}

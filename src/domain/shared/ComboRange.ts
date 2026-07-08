// 조합비 허용범위 값객체 (Shared Kernel · Value Object).
// 제품군(계열)별로 허용 조합비 범위가 다르다 — 예: GHP 1.106, DOAS 0.32도 정상 기재.
// 불변 + 자기검증: 0 < min < max, 둘 다 유한수.

export class ComboRange {
  constructor(
    readonly min: number,
    readonly max: number,
  ) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error('ComboRange의 min/max는 유한수여야 합니다')
    }
    if (min <= 0) {
      throw new Error('ComboRange의 min은 0보다 커야 합니다')
    }
    if (min >= max) {
      throw new Error('ComboRange는 min < max여야 합니다')
    }
    Object.freeze(this)
  }

  // v가 범위 안(min ≤ v ≤ max)인지 판정.
  contains(v: number): boolean {
    return v >= this.min && v <= this.max
  }

  equals(other: ComboRange): boolean {
    return other instanceof ComboRange && other.min === this.min && other.max === this.max
  }

  // 기본 권장 범위 0.5~1.3 (기존 고정 상수와 동일).
  static readonly DEFAULT = new ComboRange(0.5, 1.3)
}

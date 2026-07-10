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

  // 전역 기본 50% ~ 103% (주인님 확정 2026-07-10).
  //
  // 근거: Confluence「실내기·실외기 자동배치 룰」 — "조합비 = 실내기 용량 합계 ÷ 실외기 용량.
  // 목표 100%, 허용 50% ~ 103%. 103% 초과 = 실외기 용량 부족(over), 50% 미만 = 실외기 과대(low)."
  // 선정표 주석의 "100% 이내"·기존 코드의 1.3과 상충했으나 회의 확정값을 따른다.
  //
  // 이 값은 관리 UI(조합비 정책)에서 바꿀 수 있는 '초기 기본값'이지 불변 상수가 아니다.
  // 실외기 모델별 override는 ComboPolicy가 해석한다.
  static readonly DEFAULT = new ComboRange(0.5, 1.03)
}

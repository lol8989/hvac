// 에너지소비효율등급 값객체 (Shared Kernel · Value Object). 1~5 (1=최우수, 순서형 척도).
// 근거: 장비마스터 DB v2 efficiency_grades(id SMALLINT PK) 룩업 + products.cop_cooling.
//   등급 룩업과 제품효율(COP)은 스키마상 별개이므로 copCooling은 선택 보유(결합 강제 아님).
// 불변 + 자기검증. 순서형이라 '작을수록 우수' 의미를 캡슐화한다(원시 number 대소비교 버그 방지).

export interface EnergyGradeSpec {
  efficiencyGradeId: number | null
  copCooling?: number | null
}

export class EnergyGrade {
  readonly value: number
  readonly copCooling: number | null

  constructor(value: number, copCooling: number | null = null) {
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      throw new Error(`에너지등급은 1~5 정수여야 합니다: ${String(value)}`)
    }
    if (copCooling !== null) {
      if (typeof copCooling !== 'number' || !Number.isFinite(copCooling) || copCooling <= 0 || copCooling > 99.99) {
        throw new Error(`copCooling은 0 초과 99.99 이하 유한수여야 합니다: ${String(copCooling)}`)
      }
    }
    this.value = value
    this.copCooling = copCooling
    Object.freeze(this)
  }

  label(): string {
    return `${this.value}등급`
  }

  // 순서형: 값이 작을수록 우수(1등급 > 3등급).
  isBetterThan(other: EnergyGrade): boolean {
    return this.value < other.value
  }

  compare(other: EnergyGrade): number {
    return this.value - other.value
  }

  // 효율비(냉방) 표시. cop이 없으면 null. (mock의 'EERa 4.99' 상당, NUMERIC(4,2) → 2자리)
  eerLabel(): string | null {
    return this.copCooling === null ? null : this.copCooling.toFixed(2)
  }

  equals(other: unknown): boolean {
    return other instanceof EnergyGrade && other.value === this.value && other.copCooling === this.copCooling
  }

  // efficiencyGradeId가 null이면 등급 미부여 → null 반환.
  static fromSpec({ efficiencyGradeId, copCooling = null }: EnergyGradeSpec): EnergyGrade | null {
    if (efficiencyGradeId === null) return null
    return new EnergyGrade(efficiencyGradeId, copCooling)
  }
}

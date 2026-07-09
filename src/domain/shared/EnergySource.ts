// 계열 값객체 (Shared Kernel · Value Object).
// EHP/GHP/AWHP/수냉식/Chiller/CDU/ERV 등 호환 판단의 기준. 불변 + 자기검증.
// CDU(냉장·냉동 응축유닛)·ERV(열회수형 환기)는 공조 계통과 섞이지 않으므로 별도 계열로 분리한다.
// Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

export const ENERGY_SOURCES = ['EHP', 'GHP', 'AWHP', '수냉식', 'Chiller', 'CDU', 'ERV'] as const

export type EnergySourceCode = (typeof ENERGY_SOURCES)[number]

export class EnergySource {
  readonly code: EnergySourceCode

  constructor(code: string) {
    if (typeof code !== 'string' || !ENERGY_SOURCES.includes(code as EnergySourceCode)) {
      throw new Error(`허용되지 않은 계열입니다: ${String(code)} (허용: ${ENERGY_SOURCES.join(', ')})`)
    }
    this.code = code as EnergySourceCode
    Object.freeze(this)
  }

  equals(other: unknown): boolean {
    return other instanceof EnergySource && other.code === this.code
  }

  toString(): string {
    return this.code
  }
}

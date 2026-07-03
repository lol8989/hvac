// 계열 값객체 (Shared Kernel · Value Object).
// EHP/GHP/AWHP/수냉식/Chiller 등 호환 판단의 기준. 불변 + 자기검증.
// Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

export const ENERGY_SOURCES = ['EHP', 'GHP', 'AWHP', '수냉식', 'Chiller']

export class EnergySource {
  constructor(code) {
    if (typeof code !== 'string' || !ENERGY_SOURCES.includes(code)) {
      throw new Error(`허용되지 않은 계열입니다: ${String(code)} (허용: ${ENERGY_SOURCES.join(', ')})`)
    }
    this.code = code
    Object.freeze(this)
  }

  equals(other) {
    return other instanceof EnergySource && other.code === this.code
  }

  toString() {
    return this.code
  }
}

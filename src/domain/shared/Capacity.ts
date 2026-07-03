// 용량 값객체 (Shared Kernel · Value Object). 단위 kW.
// 불변 + 자기검증. 0보다 커야 한다(장비 용량은 양수).

export class Capacity {
  readonly value: number

  constructor(kw: number) {
    if (typeof kw !== 'number' || Number.isNaN(kw) || kw <= 0) {
      throw new Error('Capacity(kW)는 0보다 큰 숫자여야 합니다')
    }
    this.value = kw
    Object.freeze(this)
  }

  get kw(): number {
    return this.value
  }

  plus(other: Capacity): Capacity {
    return new Capacity(this.value + other.value)
  }

  equals(other: unknown): boolean {
    return other instanceof Capacity && other.value === this.value
  }
}

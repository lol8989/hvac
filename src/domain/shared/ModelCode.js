// 모델식별 값객체 (Shared Kernel · Value Object).
// 장비 모델명. 불변 + 자기검증(공백 트림, 빈값 금지).

export class ModelCode {
  constructor(value) {
    if (typeof value !== 'string') {
      throw new Error('ModelCode는 문자열이어야 합니다')
    }
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      throw new Error('ModelCode는 비어 있을 수 없습니다')
    }
    this.value = trimmed
    Object.freeze(this)
  }

  equals(other) {
    return other instanceof ModelCode && other.value === this.value
  }

  toString() {
    return this.value
  }
}

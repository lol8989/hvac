// 실내기 모델 스펙 값객체 (Generation 컨텍스트 · Value Object).
// 장비마스터(Equipment Master) 참조 데이터 — 생성 단은 PUBLISHED 스펙만 소비한다.
// 불변 + 자기검증. Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

import type { EnergySourceCode } from '../shared/EnergySource'

// 실별 실내기 선정(장비번호 코드 + 대수)
export interface IndoorSelection {
  modelCode: string
  quantity: number
}

export interface IndoorModelProps {
  code: string // 장비번호 코드 (예: '40C', '110T')
  model: string // 모델명 (예: 'RNW0401C2S')
  coolW: number // 냉방용량(W)
  heatW: number // 난방용량(W)
  type: string // 실내기 유형 (예: '4WAY 카세트', '덕트')
  series?: string // 시리즈명 — 표시·필터용 메타데이터(도메인 규칙 미사용). 마스터가 항상 제공한다.
  energySource: EnergySourceCode
}

function requireNonBlank(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name}은(는) 빈값일 수 없습니다`)
  }
  return value
}

function requirePositiveFinite(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}은(는) 0보다 큰 유한수여야 합니다`)
  }
  return value
}

function requirePositiveInt(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name}은(는) 1 이상의 정수여야 합니다`)
  }
  return value
}

export class IndoorModel {
  readonly code: string
  readonly model: string
  readonly coolW: number
  readonly heatW: number
  readonly type: string
  readonly series: string
  readonly energySource: EnergySourceCode

  constructor(props: IndoorModelProps) {
    this.code = requireNonBlank(props.code, 'code')
    this.model = requireNonBlank(props.model, 'model')
    this.type = requireNonBlank(props.type, 'type')
    this.series = props.series ?? ''
    this.coolW = requirePositiveFinite(props.coolW, 'coolW')
    this.heatW = requirePositiveFinite(props.heatW, 'heatW')
    this.energySource = props.energySource
    Object.freeze(this)
  }

  // 대수(quantity)에 따른 총 냉방용량(W). quantity는 1 이상 정수.
  totalCoolW(quantity: number): number {
    return this.coolW * requirePositiveInt(quantity, 'quantity')
  }

  // 대수(quantity)에 따른 총 난방용량(W). quantity는 1 이상 정수.
  totalHeatW(quantity: number): number {
    return this.heatW * requirePositiveInt(quantity, 'quantity')
  }

  // 동등성은 장비번호 code 기준.
  equals(o: IndoorModel): boolean {
    return o instanceof IndoorModel && o.code === this.code
  }
}

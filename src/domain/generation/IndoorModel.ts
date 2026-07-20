// 실내기 모델 스펙 값객체 (Generation 컨텍스트 · Value Object).
// 장비마스터(Equipment Master) 참조 데이터 — 생성 단은 PUBLISHED 스펙만 소비한다.
// 불변 + 자기검증. Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

import type { EnergySourceCode } from '../shared/EnergySource'
import { indoorEquipmentCode } from '../equipment/EquipmentCode'

// 실별 실내기 선정(모델코드 + 대수)
export interface IndoorSelection {
  modelCode: string
  quantity: number
}

export interface IndoorModelProps {
  model: string // 모델명 = 식별자 (예: 'RNW0401C2S')
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

// 장비번호(40C·110T)는 **마스터 속성이 아니라 파생값**이다 — 유형과 냉방용량에서 나온다
// (0708 회의록: 1웨이 C · 2웨이 G · 4웨이 T · 스탠드 P, 번호는 냉방W÷100).
// 식별자로 쓰면 안 된다: 민수전용 RNW0230M2S와 조달전용 RNW023PM2S가 둘 다 '23T'로 충돌한다.
// 그래서 동등성·카탈로그 키는 **모델코드**가 맡고, 장비번호는 표시용 파생 게터로만 제공한다.
// (주인님 지시 2026-07-20: "장비마스터에서는 장비번호를 없애라 — 배치하면서 만들기 때문에")
export class IndoorModel {
  readonly model: string
  readonly coolW: number
  readonly heatW: number
  readonly type: string
  readonly series: string
  readonly energySource: EnergySourceCode

  constructor(props: IndoorModelProps) {
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

  // 장비번호(표시용). 회의록이 문자를 정한 유형(1/2/4WAY·스탠드)만 나오고, 나머지는 null이다.
  get equipmentCode(): string | null {
    return indoorEquipmentCode(this.type, this.coolW)
  }

  // 동등성은 모델코드 기준(장비번호는 충돌한다).
  equals(o: IndoorModel): boolean {
    return o instanceof IndoorModel && o.model === this.model
  }
}

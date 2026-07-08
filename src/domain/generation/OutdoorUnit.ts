// 실외기 값객체 (Generation Context). 모델·계열·용량·최대 연결 수 + (선택)단가·에너지등급.
// 원시값을 받아 내부에서 ModelCode/EnergySource/Capacity/Price/EnergyGrade 값객체로 변환한다.
// 단가·등급은 optional(하위호환) — 미게시 모델은 없이도 유효하다.

import { Capacity } from '../shared/Capacity'
import { EnergySource } from '../shared/EnergySource'
import { ModelCode } from '../shared/ModelCode'
import { Price } from '../shared/Price'
import type { PriceEntry } from '../shared/Price'
import { EnergyGrade } from '../shared/EnergyGrade'
import { ComboRange } from '../shared/ComboRange'

export const DEFAULT_MAX_CONNECTIONS = 16
export const DEFAULT_PRICE_TYPE = 'CONSUMER'

export interface OutdoorUnitProps {
  model: string | ModelCode
  category?: string
  sys: string | EnergySource
  capacityKw: number | Capacity
  maxConnections?: number
  priceEntries?: ReadonlyArray<PriceEntry>
  efficiencyGradeId?: number | null
  copCooling?: number | null
  copHeating?: number | null
  comboRange?: ComboRange // 제품군별 조합비 허용범위 (미지정 시 ComboRange.DEFAULT)
}

// 우선순위(priority) 최댓값 → 동률 시 effectiveStartDate 최신 엔트리 선택.
const topEntry = (entries: ReadonlyArray<PriceEntry>): PriceEntry | undefined => {
  if (entries.length === 0) return undefined
  return entries.reduce((best, e) => {
    const bp = best.priority ?? 0
    const ep = e.priority ?? 0
    if (ep !== bp) return ep > bp ? e : best
    return e.effectiveStartDate > best.effectiveStartDate ? e : best
  })
}

export class OutdoorUnit {
  readonly model: ModelCode
  readonly category: string
  readonly energySource: EnergySource
  readonly capacity: Capacity
  readonly maxConnections: number
  readonly comboRange: ComboRange
  readonly grade: EnergyGrade | undefined
  readonly copHeating: number | null
  private readonly _priceEntries: PriceEntry[]

  constructor({ model, category, sys, capacityKw, maxConnections, priceEntries, efficiencyGradeId = null, copCooling = null, copHeating = null, comboRange }: OutdoorUnitProps) {
    this.model = model instanceof ModelCode ? model : new ModelCode(model)
    this.category = category ?? ''
    this.energySource = sys instanceof EnergySource ? sys : new EnergySource(sys)
    this.capacity = capacityKw instanceof Capacity ? capacityKw : new Capacity(capacityKw)

    const max = maxConnections ?? DEFAULT_MAX_CONNECTIONS
    if (!Number.isInteger(max) || max <= 0) {
      throw new Error('maxConnections는 1 이상의 정수여야 합니다')
    }
    this.maxConnections = max
    this.comboRange = comboRange ?? ComboRange.DEFAULT

    // 단가 엔트리를 검증(Price VO 생성으로 자기검증) 후 보관.
    this._priceEntries = (priceEntries ?? []).map((e) => {
      Price.fromEntry(e) // 유효성 검증(불변식 위반 시 throw)
      return e
    })
    this.grade = EnergyGrade.fromSpec({ efficiencyGradeId, copCooling }) ?? undefined
    this.copHeating = copHeating
    Object.freeze(this)
  }

  // 게시된 모든 단가(Price VO 목록).
  get prices(): Price[] {
    return this._priceEntries.map((e) => Price.fromEntry(e))
  }

  // 기본 단가: 우선순위 최상위 현행가. 미게시면 undefined.
  get defaultPrice(): Price | undefined {
    const top = topEntry(this._priceEntries)
    return top ? Price.fromEntry(top) : undefined
  }

  // 특정 유형(소비자가/공급가 등)의 단가.
  priceOf(typeCode: string): Price | undefined {
    const top = topEntry(this._priceEntries.filter((e) => e.priceTypeCode === typeCode))
    return top ? Price.fromEntry(top) : undefined
  }

  equals(other: unknown): boolean {
    if (!(other instanceof OutdoorUnit)) return false
    const coreEqual =
      other.model.equals(this.model) &&
      other.energySource.equals(this.energySource) &&
      other.capacity.equals(this.capacity) &&
      other.maxConnections === this.maxConnections &&
      other.comboRange.equals(this.comboRange)
    if (!coreEqual) return false
    return optEquals(this.defaultPrice, other.defaultPrice) && optEquals(this.grade, other.grade)
  }
}

// 옵셔널-안전 동등: 둘 다 없으면 동등(하위호환), 둘 다 있으면 값 비교, 한쪽만 있으면 다름.
function optEquals(a: { equals(o: unknown): boolean } | undefined, b: { equals(o: unknown): boolean } | undefined): boolean {
  if (a === undefined && b === undefined) return true
  if (a === undefined || b === undefined) return false
  return a.equals(b)
}

// 단가 값객체 (Shared Kernel · Value Object). 통화 KRW 고정(스키마에 통화 컬럼 없음).
// 근거: 장비마스터 DB v2 product_prices(price_krw NUMERIC(14,0) 정수 원, price_with_vat_krw,
// price_type_id, effective_start_date). 게시뷰 v_published_product_prices가 현행가 계약.
// 불변 + 자기검증. 서로 다른 유형(소비자가/공급가) 혼합 합산은 차단한다.

// 단가 엔트리(원재료 DTO). 도메인 소유 — 상위(application/게시뷰)는 이 형태를 재사용한다.
// 근거: v_published_product_prices의 현행가 한 행.
export interface PriceEntry {
  priceTypeCode: string
  priceKrw: number
  priceWithVatKrw: number | null
  effectiveStartDate: string // yyyy-mm-dd
  priority?: number // 기본 단가 선택 우선순위(클수록 우선)
  sourceReference?: string // 출처(예: 단가표/장비일람표)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
// product_prices.price_krw NUMERIC(14,0) 상한(= 10^14 - 1). 2^53 안전정수 이내.
export const MAX_KRW = 99_999_999_999_999

const assertIntKrw = (v: number, label: string): void => {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > MAX_KRW) {
    throw new Error(`${label}는 0 이상 ${MAX_KRW} 이하의 정수(원)여야 합니다: ${String(v)}`)
  }
}

export interface PriceProps {
  krw: number
  typeCode: string
  effectiveStartDate: string
  withVatKrw?: number | null
}

export class Price {
  readonly krw: number
  readonly withVatKrw: number | null
  readonly typeCode: string
  readonly effectiveStartDate: string

  constructor({ krw, typeCode, effectiveStartDate, withVatKrw = null }: PriceProps) {
    assertIntKrw(krw, 'priceKrw')
    if (withVatKrw !== null) {
      assertIntKrw(withVatKrw, 'priceWithVatKrw')
      if (withVatKrw < krw) {
        throw new Error('priceWithVatKrw는 priceKrw 이상이어야 합니다(VAT 감액 불가)')
      }
    }
    if (typeof typeCode !== 'string' || typeCode.trim().length === 0) {
      throw new Error('priceTypeCode는 비어 있을 수 없습니다')
    }
    if (typeof effectiveStartDate !== 'string' || !ISO_DATE.test(effectiveStartDate) || Number.isNaN(Date.parse(effectiveStartDate))) {
      throw new Error(`effectiveStartDate는 유효한 yyyy-mm-dd여야 합니다: ${String(effectiveStartDate)}`)
    }
    this.krw = krw
    this.withVatKrw = withVatKrw
    this.typeCode = typeCode.trim()
    this.effectiveStartDate = effectiveStartDate
    Object.freeze(this)
  }

  // 같은 유형끼리만 합산. VAT는 둘 다 있을 때만 합산(하나라도 null이면 null=미상 전파).
  plus(other: Price): Price {
    if (other.typeCode !== this.typeCode) {
      throw new Error(`단가 유형이 달라 합산할 수 없습니다: ${this.typeCode} vs ${other.typeCode}`)
    }
    const withVatKrw = this.withVatKrw !== null && other.withVatKrw !== null ? this.withVatKrw + other.withVatKrw : null
    return new Price({ krw: this.krw + other.krw, typeCode: this.typeCode, effectiveStartDate: this.effectiveStartDate, withVatKrw })
  }

  format(): string {
    return `${this.krw.toLocaleString('ko-KR')}원`
  }

  equals(other: unknown): boolean {
    return other instanceof Price && other.krw === this.krw && other.typeCode === this.typeCode
  }

  static zero(typeCode: string, effectiveStartDate = '2000-01-01'): Price {
    return new Price({ krw: 0, typeCode, effectiveStartDate, withVatKrw: 0 })
  }

  static sum(prices: ReadonlyArray<Price>): Price {
    if (prices.length === 0) {
      throw new Error('Price.sum: 빈 배열은 합산할 수 없습니다(호출측이 zero로 처리)')
    }
    return prices.reduce((acc, p) => acc.plus(p))
  }

  static fromEntry(e: PriceEntry): Price {
    return new Price({ krw: e.priceKrw, typeCode: e.priceTypeCode, effectiveStartDate: e.effectiveStartDate, withVatKrw: e.priceWithVatKrw })
  }
}

import { describe, it, expect } from 'vitest'
import { Price, MAX_KRW } from './Price'

const base = { krw: 4120000, typeCode: 'CONSUMER', effectiveStartDate: '2026-04-20', withVatKrw: 4532000 }

describe('Price (단가 값객체, KRW)', () => {
  it('정수 원가·유형·시작일로 생성되고 게터로 읽는다', () => {
    const p = new Price(base)
    expect(p.krw).toBe(4120000)
    expect(p.withVatKrw).toBe(4532000)
    expect(p.typeCode).toBe('CONSUMER')
    expect(p.effectiveStartDate).toBe('2026-04-20')
  })

  it('withVatKrw는 null일 수 있다(미상)', () => {
    expect(new Price({ ...base, withVatKrw: null }).withVatKrw).toBeNull()
  })

  it('format은 천단위 콤마 + 원으로 표시한다', () => {
    expect(new Price(base).format()).toBe('4,120,000원')
  })

  it('plus는 같은 유형이면 krw를 합산한다', () => {
    const sum = new Price(base).plus(new Price({ ...base, krw: 6350000, withVatKrw: 6985000 }))
    expect(sum.krw).toBe(10470000)
    expect(sum.withVatKrw).toBe(11517000)
    expect(sum.typeCode).toBe('CONSUMER')
  })

  it('plus는 한쪽 withVat가 null이면 결과 withVat도 null(미상 전파)', () => {
    const sum = new Price(base).plus(new Price({ ...base, withVatKrw: null }))
    expect(sum.withVatKrw).toBeNull()
  })

  it('zero는 0원 단가를 만든다(집계 초기값)', () => {
    expect(Price.zero('CONSUMER').krw).toBe(0)
  })

  it('sum은 여러 단가를 합산한다', () => {
    const total = Price.sum([new Price(base), new Price({ ...base, krw: 1000000, withVatKrw: 1100000 })])
    expect(total.krw).toBe(5120000)
  })

  it('fromEntry는 게시 엔트리를 Price로 변환한다', () => {
    const p = Price.fromEntry({ priceTypeCode: 'CONSUMER', priceKrw: 4120000, priceWithVatKrw: 4532000, effectiveStartDate: '2026-04-20' })
    expect(p.krw).toBe(4120000)
    expect(p.typeCode).toBe('CONSUMER')
  })

  it('equals는 krw·typeCode 기준', () => {
    expect(new Price(base).equals(new Price({ ...base, withVatKrw: null }))).toBe(true)
    expect(new Price(base).equals(new Price({ ...base, krw: 1 }))).toBe(false)
    expect(new Price(base).equals(new Price({ ...base, typeCode: 'SUPPLY' }))).toBe(false)
  })

  // ─── 적대적 QA ───
  it('[적대] 음수/소수/NaN/Infinity 원가는 예외(NUMERIC(14,0) 정수)', () => {
    expect(() => new Price({ ...base, krw: -1 })).toThrow()
    expect(() => new Price({ ...base, krw: 4120000.5 })).toThrow()
    expect(() => new Price({ ...base, krw: NaN })).toThrow()
    expect(() => new Price({ ...base, krw: Infinity })).toThrow()
  })

  it('[적대] withVat가 krw보다 작으면 예외(VAT 감액 불가)', () => {
    expect(() => new Price({ ...base, withVatKrw: 4000000 })).toThrow()
  })

  it('[경계] NUMERIC(14,0) 상한값은 허용, 초과는 예외', () => {
    expect(new Price({ ...base, krw: MAX_KRW, withVatKrw: null }).krw).toBe(MAX_KRW)
    expect(() => new Price({ ...base, krw: MAX_KRW + 1, withVatKrw: null })).toThrow()
  })

  it('[경계] 대규모 합산도 정수 정밀도를 유지한다(2^53 이내)', () => {
    const p = new Price({ ...base, krw: 12400000, withVatKrw: null })
    const total = Price.sum(Array.from({ length: 33 }, () => p))
    expect(total.krw).toBe(409200000)
  })

  it('[적대] typeCode가 비어있으면 예외', () => {
    expect(() => new Price({ ...base, typeCode: '  ' })).toThrow()
  })

  it('[적대] 유효하지 않은 시작일이면 예외', () => {
    expect(() => new Price({ ...base, effectiveStartDate: '2026/04/20' })).toThrow()
    expect(() => new Price({ ...base, effectiveStartDate: '2026-13-40' })).toThrow()
  })

  it('[적대] 유형이 다르면 plus/sum이 차단된다(혼합 합산 금지)', () => {
    expect(() => new Price(base).plus(new Price({ ...base, typeCode: 'SUPPLY' }))).toThrow()
    expect(() => Price.sum([new Price(base), new Price({ ...base, typeCode: 'SUPPLY' })])).toThrow()
  })

  it('[적대] sum은 빈 배열이면 예외(호출측이 zero로 처리)', () => {
    expect(() => Price.sum([])).toThrow()
  })

  it('[적대] 값객체는 불변이라 수정이 차단된다', () => {
    const p = new Price(base)
    expect(() => {
      // @ts-expect-error 불변(freeze) 위반은 런타임에서 차단
      p.krw = 1
    }).toThrow()
  })
})

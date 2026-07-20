// 실내기 모델·대수 선정 (Confluence ④ + 0708 수정 룰).
//
//   · 부하를 충족하는 가장 작은 용량을 고른다(과대선정 방지)
//   · 한 방에는 초과하더라도 동일 용량으로 배치한다 (예: 190 필요 → 52×4 = 208, 52+72×2 아님)
//   · 대수는 부하 기준과 확산범위 기준 중 큰 값
//   · 동일 용량이 여럿이면 최신형(모델 목록 앞) 우선
import { describe, it, expect } from 'vitest'
import { selectIndoorModel } from './selectIndoorModel'
import { IndoorModel } from './IndoorModel'

const m = (code: string, coolW: number, type: string) =>
  new IndoorModel({ model: `M-${code}`, coolW, heatW: Math.round(coolW * 1.12), type, energySource: 'EHP' })

// 0708 회의 예시와 같은 라인업: 4WAY는 52·60·72, 1WAY는 20.
const CATALOG = [m('52C', 5200, '4WAY 카세트'), m('60C', 6000, '4WAY 카세트'), m('72C', 7200, '4WAY 카세트'), m('20W', 2000, '1WAY 카세트')]

const shape = { shortSideM: 5, longSideM: 6, residential: false, corridor: false }

describe('selectIndoorModel — 동일 용량 배치', () => {
  // 0708 회의 예시: 장비가 52·60·72일 때 190kW가 필요하면 52×4(=208)이지 52×1+72×2(=196)가 아니다.
  it('한 방에는 같은 용량만 쓴다 (섞지 않는다)', () => {
    const r = selectIndoorModel({ requiredCoolW: 19000, areaM2: 20, shape, models: CATALOG })
    expect(r.quantity * r.model.coolW).toBeGreaterThanOrEqual(19000)
    // 같은 모델 하나로 표현된다
    expect(r.model.model).toBeDefined()
  })

  // 0708 회의 예시 그대로: 190kW 필요 · 장비 52/60/72 → 52×4(=208)
  it('부하를 충족하는 조합 중 총용량이 가장 작은 것을 고른다', () => {
    // 19000W: 52×4=20800 · 60×4=24000 · 72×3=21600 → 52×4가 최소
    const r = selectIndoorModel({ requiredCoolW: 19000, areaM2: 20, shape, models: CATALOG })
    expect(r.model.coolW).toBe(5200)
    expect(r.quantity).toBe(4)
  })

  it('1대로 충족되면 가장 작은 용량 1대 (과대선정 방지)', () => {
    const r = selectIndoorModel({ requiredCoolW: 5000, areaM2: 20, shape, models: CATALOG })
    expect(r.model.coolW).toBe(5200)
    expect(r.quantity).toBe(1)
  })

  it('총용량이 정확히 맞는 조합을 고른다', () => {
    // 12000W: 52×3=15600 · 60×2=12000 · 72×2=14400 → 딱 맞는 60×2
    const r = selectIndoorModel({ requiredCoolW: 12000, areaM2: 20, shape, models: CATALOG })
    expect(r.model.coolW).toBe(6000)
    expect(r.quantity).toBe(2)
  })
})

describe('selectIndoorModel — 타입 결정과 맞물린다', () => {
  it('형상·부하로 정해진 타입의 모델만 후보다', () => {
    const r = selectIndoorModel({ requiredCoolW: 5000, areaM2: 20, shape, models: CATALOG })
    expect(r.type).toBe('4WAY')
    expect(r.model.type).toContain('4WAY')
  })

  it('단위세대는 1WAY 모델을 고른다', () => {
    const r = selectIndoorModel({ requiredCoolW: 1800, areaM2: 12, shape: { ...shape, residential: true }, models: CATALOG })
    expect(r.type).toBe('1WAY')
    expect(r.model.model).toBe('M-20W')
  })

  it('그 타입 모델이 카탈로그에 없으면 throw 한다 (조용히 다른 타입을 쓰지 않는다)', () => {
    const only4way = CATALOG.filter((x) => x.type.includes('4WAY'))
    expect(() => selectIndoorModel({ requiredCoolW: 1800, areaM2: 12, shape: { ...shape, residential: true }, models: only4way })).toThrow('1WAY')
  })
})

describe('selectIndoorModel — 확산범위가 대수를 늘린다', () => {
  it('부하는 1대로 충분해도 면적이 넓으면 대수가 늘어난다', () => {
    // 4WAY 1대 실효 커버 63.6㎡ → 130㎡면 3대
    const r = selectIndoorModel({ requiredCoolW: 5000, areaM2: 130, shape, models: CATALOG })
    expect(r.quantity).toBe(3)
    expect(r.model.coolW).toBe(5200) // 대수가 3으로 고정되면 가장 작은 용량이 총용량 최소
  })
})

describe('selectIndoorModel — 방어', () => {
  it('빈 카탈로그는 throw', () => {
    expect(() => selectIndoorModel({ requiredCoolW: 5000, areaM2: 20, shape, models: [] })).toThrow()
  })

  it('부하가 0 이하면 throw', () => {
    expect(() => selectIndoorModel({ requiredCoolW: 0, areaM2: 20, shape, models: CATALOG })).toThrow()
  })
})

// 표준 260415 장비선정표 엑셀은 근소한 부족을 허용한다(3255.8W → 32C 1대 = 3200W, -1.7%).
// 0708 회의 예시(190 → 52×4 = 208)와 함께 성립하는 구간은 1.72%~5.26%뿐 → 3%로 고정.
// 주인님 확정 2026-07-10.
describe('selectIndoorModel — 근소 부족 허용(3%)', () => {
  const only = [m('32C', 3200, '4WAY 카세트'), m('40C', 4000, '4WAY 카세트')]

  it('부족이 3% 이내면 그 조합을 인정한다 (엑셀 실측: 3255.8W → 32C×1)', () => {
    const r = selectIndoorModel({ requiredCoolW: 3255.8, areaM2: 20, shape, models: only })
    expect(r.model.model).toBe('M-32C')
    expect(r.quantity).toBe(1)
  })

  it('부족이 3%를 넘으면 대수를 올린다', () => {
    // 3400W: 32C×1 = 3200 → 5.9% 부족(불가) · 40C×1 = 4000 충족
    const r = selectIndoorModel({ requiredCoolW: 3400, areaM2: 20, shape, models: only })
    expect(r.model.model).toBe('M-40C')
    expect(r.quantity).toBe(1)
  })

  // 허용폭이 5.26% 이상이면 60×3(=18,000W, 5.26% 부족)이 총용량 최소가 되어 예시가 뒤집힌다.
  // 3%에서는 60×3이 탈락하고 52×4(=20,800W)가 남는다 — 0708 결론과 같다.
  it('0708 예시(52·60·72 중 52×4)는 허용폭 3%에서 유지된다', () => {
    const r = selectIndoorModel({ requiredCoolW: 19000, areaM2: 20, shape, models: CATALOG })
    expect(r.model.coolW).toBe(5200)
    expect(r.quantity).toBe(4)
  })

  it('허용 한계 정확히 3% 부족은 인정한다 (경계값)', () => {
    // 필요 3298.97W → 32C×1 = 3200 → 정확히 3.0% 부족
    const r = selectIndoorModel({ requiredCoolW: 3200 / 0.97, areaM2: 20, shape, models: only })
    expect(r.model.model).toBe('M-32C')
    expect(r.quantity).toBe(1)
  })
})

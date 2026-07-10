// 업로드 등록 시 마력(HP) 확보 전략 (주인님 지시 2026-07-10).
//
//   VRF 시리즈     → 모델명 유도(엄격). 못 뽑으면 ERROR — 샤시명 등 오인 유입을 계속 차단한다.
//   비-VRF 시리즈  → 모델명 숫자가 용량이라 유도 불가 → 냉방용량 환산으로 백필(DERIVED).
//
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md §5
import { describe, it, expect } from 'vitest'
import { classifyImport, type ParsedProduct } from './SpecImport'

const p = (over: Partial<ParsedProduct> = {}): ParsedProduct => ({
  modelCode: 'RPUW281X9P',
  coolingW: 78400,
  heatingW: 88000,
  maxConnections: 40,
  specData: {},
  ...over,
})

const run = (products: ParsedProduct[], isVrf: boolean) => classifyImport(products, { isOutdoor: true, isVrf, existingModelCodes: [] })

describe('classifyImport — 마력 출처(hpSource)', () => {
  it('VRF 실외기는 모델명에서 HP를 뽑고 출처를 MODEL_CODE로 남긴다', () => {
    const r = run([p()], true)
    expect(r.rows[0]).toMatchObject({ verdict: 'OK', horsepower: 28, hpSource: 'MODEL_CODE' })
  })

  it('VRF 실외기는 냉방용량으로 100HP대를 판별한다', () => {
    const r = run([p({ modelCode: 'RP-Q1001X9S', coolingW: 280600, heatingW: null })], true)
    expect(r.rows[0]).toMatchObject({ verdict: 'OK', horsepower: 100, hpSource: 'MODEL_CODE' })
  })

  it('VRF 실외기는 모델명에서 못 뽑으면 여전히 ERROR (용량이 있어도 백필하지 않는다)', () => {
    const r = run([p({ modelCode: 'UXB' })], true)
    expect(r).toMatchObject({ ok: 0, error: 1 })
    expect(r.rows[0].reason).toContain('마력(HP)')
    expect(r.rows[0].hpSource).toBeNull()
  })

  it('비-VRF 실외기는 냉방용량 환산으로 백필하고 출처를 DERIVED로 남긴다', () => {
    const chiller = p({ modelCode: 'ACAH020LET2', coolingW: 65000, heatingW: null, maxConnections: null })
    const r = run([chiller], false)
    expect(r.rows[0]).toMatchObject({ verdict: 'OK', horsepower: 22, hpSource: 'DERIVED' })
  })

  it('비-VRF 실외기는 모델명 숫자를 HP로 오독하지 않는다 (LSC-V1200C9 = 12kW, 12HP 아님)', () => {
    const cdu = p({ modelCode: 'LSC-V1200C9', coolingW: 12000, heatingW: null, maxConnections: null })
    expect(run([cdu], false).rows[0].horsepower).toBe(4) // 12000 ÷ 2906.98 = 4.13
  })

  it('비-VRF 실외기에 냉방용량이 없으면 백필할 수 없어 ERROR', () => {
    const r = run([p({ modelCode: 'ACAH020LET2', coolingW: null, heatingW: 40000, maxConnections: null })], false)
    expect(r).toMatchObject({ ok: 0, error: 1 })
    expect(r.rows[0].reason).toContain('마력(HP)')
  })

  it('실내기 업로드는 HP도 출처도 없다', () => {
    const r = classifyImport([p({ modelCode: 'RNW0401C2S', coolingW: 4000, heatingW: 4500, maxConnections: null })], {
      isOutdoor: false,
      isVrf: false,
      existingModelCodes: [],
    })
    expect(r.rows[0]).toMatchObject({ verdict: 'OK', horsepower: null, hpSource: null })
  })
})

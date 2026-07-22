// 실내기 자동배치 룰 — 타입 결정 · 대수 결정 (주인님 지시 2026-07-10).
// 근거: Confluence「실내기·실외기 자동배치 룰」 ②③ + 0708 회의 수정 룰
import { describe, it, expect } from 'vitest'
import { indoorTypeFor, effectiveCoverageM2, unitCountFor, COVERAGE, INDOOR_TYPES } from './placementRules'

describe('indoorTypeFor — 타입 결정', () => {
  const base = { shortSideM: 5, longSideM: 6, requiredCoolW: 3000, residential: false, corridor: false }

  it('짧은 폭이 4m 이상이면 4WAY', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 4.0 })).toBe('4WAY')
    expect(indoorTypeFor({ ...base, shortSideM: 4.37, longSideM: 7.29 })).toBe('4WAY') // 거실
  })

  // 0708 수정: 2way는 짧은쪽 폭 3m 이하 (원본은 4m 미만이었다)
  it('짧은 폭 3m 이하이고 긴 변이 4m를 넘으면 2WAY', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 3.0, longSideM: 6.0 })).toBe('2WAY')
    expect(indoorTypeFor({ ...base, shortSideM: 2.5, longSideM: 4.1 })).toBe('2WAY')
  })

  it('짧은 폭 3m 이하라도 긴 변이 4m 이하면 1WAY (작은 방)', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 2.5, longSideM: 4.0 })).toBe('1WAY')
  })

  // 폭 3~4m 구간은 2WAY 조건(≤3m)에도, 4WAY 조건(≥4m)에도 걸리지 않는다 → 1WAY
  it('짧은 폭이 3m 초과 4m 미만이면 1WAY', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 3.36, longSideM: 5.5 })).toBe('1WAY') // 침실1
  })

  // 0708 수정: 4kW 이상은 복도가 아닌 실이면 4WAY 기본
  it('필요부하 4kW 이상이고 복도가 아니면 형상과 무관하게 4WAY', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 2.0, longSideM: 3.0, requiredCoolW: 4000 })).toBe('4WAY')
  })

  it('복도는 부하가 커도 형상 규칙을 따른다', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 2.0, longSideM: 8.0, requiredCoolW: 6000, corridor: true })).toBe('2WAY')
  })

  // 0708 수정: 단위세대(주거·오피스텔)는 무조건 1WAY — 다른 규칙보다 우선한다
  it('단위세대는 부하·형상과 무관하게 1WAY', () => {
    expect(indoorTypeFor({ ...base, residential: true })).toBe('1WAY')
    expect(indoorTypeFor({ ...base, residential: true, shortSideM: 6, longSideM: 9, requiredCoolW: 9000 })).toBe('1WAY')
  })

  it('짧은 변·긴 변을 뒤집어 줘도 같은 결과다', () => {
    expect(indoorTypeFor({ ...base, shortSideM: 7.29, longSideM: 4.37 })).toBe('4WAY')
  })

  it('타입 목록은 1WAY · 2WAY · 4WAY 셋이다', () => {
    expect(INDOOR_TYPES).toEqual(['1WAY', '2WAY', '4WAY'])
  })
})

describe('effectiveCoverageM2 — 1대 실효 커버면적', () => {
  // 확산반경(원 면적) × 방향성 손실. 0708 수정: 4WAY 반경 4.5m
  it('4WAY는 반경 4.5m · 손실 없음', () => {
    expect(COVERAGE['4WAY'].radiusM).toBe(4.5)
    expect(effectiveCoverageM2('4WAY', 5000)).toBeCloseTo(Math.PI * 4.5 ** 2, 3)
  })

  it('2WAY는 반경 4.0m · 60%', () => {
    expect(effectiveCoverageM2('2WAY', 5000)).toBeCloseTo(Math.PI * 16 * 0.6, 3)
  })

  // 1WAY는 용량에 따라 반경이 다르다 (2.0~4.0kW → 3.5m, 5.2~7.2kW → 5.0m)
  it('1WAY는 용량으로 반경이 갈린다 · 40%', () => {
    expect(effectiveCoverageM2('1WAY', 4000)).toBeCloseTo(Math.PI * 3.5 ** 2 * 0.4, 3)
    expect(effectiveCoverageM2('1WAY', 5200)).toBeCloseTo(Math.PI * 5.0 ** 2 * 0.4, 3)
  })
})

describe('unitCountFor — 대수 결정', () => {
  // 부하 기준과 확산범위 기준 중 큰 값
  it('부하 기준: 올림(필요부하 ÷ 타입 최대모델 용량)', () => {
    // 커버면적이 넉넉하면 부하가 대수를 정한다
    expect(unitCountFor({ requiredCoolW: 20000, areaM2: 10, type: '4WAY', modelCoolW: 9000 })).toBe(3)
  })

  it('확산범위 기준: 올림(면적 ÷ 1대 실효 커버면적)', () => {
    // 부하는 1대로 충분하지만 면적이 넓으면 대수가 늘어난다
    expect(unitCountFor({ requiredCoolW: 3000, areaM2: 130, type: '4WAY', modelCoolW: 9000 })).toBe(3) // 130 / 63.6
  })

  it('둘 중 큰 값을 채택한다', () => {
    expect(unitCountFor({ requiredCoolW: 20000, areaM2: 130, type: '4WAY', modelCoolW: 9000 })).toBe(3)
    expect(unitCountFor({ requiredCoolW: 40000, areaM2: 130, type: '4WAY', modelCoolW: 9000 })).toBe(5)
  })

  it('최소 1대', () => {
    expect(unitCountFor({ requiredCoolW: 100, areaM2: 1, type: '4WAY', modelCoolW: 9000 })).toBe(1)
  })

  // "수동으로 1대당 담당면적을 지정하면 그 값이 우선한다"
  it('1대당 담당면적을 지정하면 확산범위 기준을 대체한다', () => {
    expect(unitCountFor({ requiredCoolW: 3000, areaM2: 100, type: '4WAY', modelCoolW: 9000, coverageOverrideM2: 25 })).toBe(4)
  })

  it('거실(31.89㎡ · 5.6kW · 4WAY)은 1대다', () => {
    expect(unitCountFor({ requiredCoolW: 5563, areaM2: 31.89, type: '4WAY', modelCoolW: 9000 })).toBe(1)
  })

  // 정본 규칙은 근소 부족(3%)을 허용한다 — 허용이 없으면 경계에서 1대가 더 얹힌다.
  it('부하 기준에 3% 부족허용을 적용한다(3255.8W ÷ 3200W = 1대)', () => {
    // 표준 장비선정표: 3255.8W → 32C(3200W) 1대(1.72% 부족 인정). 허용 없으면 ceil(1.017)=2대가 된다.
    expect(unitCountFor({ requiredCoolW: 3255.8, areaM2: 1, type: '4WAY', modelCoolW: 3200 })).toBe(1)
  })

  it('잘못된 입력은 거부한다', () => {
    expect(() => unitCountFor({ requiredCoolW: 0, areaM2: 10, type: '4WAY', modelCoolW: 9000 })).toThrow()
    expect(() => unitCountFor({ requiredCoolW: 1000, areaM2: 10, type: '4WAY', modelCoolW: 0 })).toThrow()
  })
})

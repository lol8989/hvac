import { describe, it, expect } from 'vitest'
import { normalizeUsage, resolveUnitLoadKcal, UNNAMED_USAGE, isUnnamed } from './usageResolution'
import { FALLBACK_KCAL } from './unitLoadTable'

describe('표기 정규화', () => {
  it('앞뒤 공백과 내부 공백을 접는다', () => {
    expect(normalizeUsage('  회 의 실 ')).toBe('회의실')
  })

  it('번호 접미사를 뗀다 — 도면은 같은 실을 회의실1·회의실-2로 적는다', () => {
    expect(normalizeUsage('회의실1')).toBe('회의실')
    expect(normalizeUsage('회의실-2')).toBe('회의실')
    expect(normalizeUsage('회의실 03')).toBe('회의실')
  })

  it('괄호 주석을 뗀다', () => {
    expect(normalizeUsage('사무실(A동)')).toBe('사무실')
    expect(normalizeUsage('사무실 [3층]')).toBe('사무실')
  })

  it('실명 자체가 숫자로 끝나는 표 항목은 지키지 않는다 — 표에 그런 실명이 없다', () => {
    // 방어: 정규화가 실명을 빈 문자열로 만들면 안 된다
    expect(normalizeUsage('101')).toBe('101')
  })

  it('이미 깨끗한 실명은 그대로 둔다', () => {
    expect(normalizeUsage('수술실')).toBe('수술실')
  })
})

describe('무명 실 판정', () => {
  it('빈 값·null·미상 표기는 무명이다', () => {
    expect(isUnnamed('')).toBe(true)
    expect(isUnnamed('   ')).toBe(true)
    expect(isUnnamed(UNNAMED_USAGE)).toBe(true)
    expect(isUnnamed('미상')).toBe(true)
  })

  it('실명이 있으면 무명이 아니다', () => {
    expect(isUnnamed('회의실')).toBe(false)
  })
})

describe('단위부하 조회 — 근거를 함께 돌려준다', () => {
  it('표에 있는 실명은 exact로 표시한다', () => {
    const r = resolveUnitLoadKcal('개인병원', '수술실')
    expect(r.kcal).toBe(180)
    expect(r.matched).toBe('exact')
  })

  it('정규화로 걸리면 normalized로 표시한다', () => {
    const r = resolveUnitLoadKcal('OFFICE', '회의실-2')
    expect(r.kcal).toBe(150)
    expect(r.matched).toBe('normalized')
  })

  it('동의어로 걸리면 alias로 표시하고 무엇으로 흡수됐는지 알린다', () => {
    const r = resolveUnitLoadKcal('OFFICE', '강당')
    expect(r.kcal).toBe(150)
    expect(r.matched).toBe('alias')
    expect(r.resolvedUsage).toBe('회의실')
  })

  it('표에 없는 실명은 unknown — 사전에 추가할 후보다', () => {
    const r = resolveUnitLoadKcal('개인병원', '처치실')
    expect(r.kcal).toBe(FALLBACK_KCAL)
    expect(r.matched).toBe('unknown')
  })

  it('무명 실은 unnamed — 현업이 실명을 넣어야 한다(사전 문제가 아니다)', () => {
    const r = resolveUnitLoadKcal('개인병원', '')
    expect(r.kcal).toBe(FALLBACK_KCAL)
    expect(r.matched).toBe('unnamed')
  })

  it('unknown과 unnamed는 같은 150이어도 구분된다 — 조치가 다르다', () => {
    expect(resolveUnitLoadKcal('개인병원', '처치실').matched).not.toBe(
      resolveUnitLoadKcal('개인병원', '').matched,
    )
  })

  it('강도 칸이 비면 standard로 떨어지되 근거는 유지한다', () => {
    const r = resolveUnitLoadKcal('OFFICE', '관리실', 'HIGH')
    expect(r.kcal).toBe(150) // 관리실은 standard만 있다
    expect(r.matched).toBe('exact')
  })
})

describe('폴백 관측 — 얼마나 새는지 셀 수 있어야 한다', () => {
  it('근거가 exact/normalized/alias면 신뢰할 수 있는 값이다', () => {
    const trusted = ['exact', 'normalized', 'alias']
    expect(trusted).toContain(resolveUnitLoadKcal('숙박시설', '객실').matched)
    expect(trusted).toContain(resolveUnitLoadKcal('숙박시설', '객실 12').matched)
  })

  it('근거가 unknown/unnamed면 확인이 필요한 값이다', () => {
    const needsReview = ['unknown', 'unnamed']
    expect(needsReview).toContain(resolveUnitLoadKcal('숙박시설', '프런트').matched)
    expect(needsReview).toContain(resolveUnitLoadKcal('숙박시설', '  ').matched)
  })
})

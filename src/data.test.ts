import { describe, it, expect } from 'vitest'
import { recommendedIndoorIdx, outdoorIdxByModel, ratioOf, indoorCoolByModel, MODELS, ROOMS, ODU_CATALOG, INITIAL_GROUPS } from './data'
import type { ModelCard } from './data'
import { DEFAULT_UNIT_LOADS } from './domain/shared/UnitLoad'

// 부하 근사 매칭용 목업 카드(용량만 의미 있음)
const cards: ModelCard[] = [
  { mn: 'A', ms: '', mp: '', md: '', on: false, cool: 2.64 },
  { mn: 'B', ms: '', mp: '', md: '', on: false, cool: 4.0 },
  { mn: 'C', ms: '', mp: '', md: '', on: false, cool: 6.0 },
]

describe('recommendedIndoorIdx (냉방부하 근사 매칭)', () => {
  it('부하와 정확히 일치하는 용량이 있으면 그 카드를 고른다', () => {
    expect(recommendedIndoorIdx(4.0, cards)).toBe(1)
  })

  it('정확히 일치하지 않으면 가장 가까운 용량을 고른다', () => {
    expect(recommendedIndoorIdx(5.6, cards)).toBe(2) // 6.0이 4.0보다 가까움
    expect(recommendedIndoorIdx(3.5, cards)).toBe(1) // 4.0(0.5)이 2.64(0.86)보다 가까움
    expect(recommendedIndoorIdx(3.0, cards)).toBe(0) // 2.64(0.36)가 4.0(1.0)보다 가까움
  })

  it('중간(동률)이면 더 큰 용량을 우선한다', () => {
    expect(recommendedIndoorIdx(5.0, cards)).toBe(2) // 4.0/6.0 동률 → 6.0
  })

  it('부하가 최대 용량을 초과하면 최대 카드를 고른다', () => {
    expect(recommendedIndoorIdx(30, cards)).toBe(2)
  })

  it('기본 카탈로그(MODELS.in)로도 유효한 인덱스를 반환한다', () => {
    const idx = recommendedIndoorIdx(9.0)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(MODELS.in.length)
  })
})

describe('indoorCoolByModel (모델명 → 정격 냉방용량)', () => {
  it('존재하는 모델은 그 용량을 반환', () => {
    const m = MODELS.in[2]
    expect(indoorCoolByModel(m.mn)).toBe(m.cool)
  })
  it('미지정(undefined)/미매칭은 0', () => {
    expect(indoorCoolByModel(undefined)).toBe(0)
    expect(indoorCoolByModel('NON_EXISTENT')).toBe(0)
  })
})

describe('ratioOf (조합비 = Σ실내기 정격 ÷ 실외기 용량)', () => {
  const group = { items: ['R1', 'R2'], cool: 20 }
  it('capByRoom(B: 선택 장비 기준)로 합산한다', () => {
    expect(ratioOf(group, { R1: 6, R2: 4 })).toBeCloseTo(0.5) // (6+4)/20
  })
  it('capByRoom에 없는 실은 0으로 취급(미설치)', () => {
    expect(ratioOf(group, { R1: 6 })).toBeCloseTo(0.3) // (6+0)/20
  })
  it('실외기 용량 0이면 0(division 방지)', () => {
    expect(ratioOf({ items: ['R1'], cool: 0 }, { R1: 6 })).toBe(0)
  })
})

describe('ROOMS 부하 파생 (부하 = 면적 × 용도별 단위부하 × 1.163)', () => {
  it('전 실에 층·용도 메타가 있다 (지상1층, 용도 지정)', () => {
    const usages: Record<string, string> = {
      AC_001: '거실', AC_002: '침실', AC_003: '회의실',
      AC_004: '사무실', AC_005: '로비', AC_006: '탕비실',
    }
    for (const [id, usage] of Object.entries(usages)) {
      expect(ROOMS[id].floor).toBe('지상1층')
      expect(ROOMS[id].usage).toBe(usage)
    }
  })

  it('cool(kW)은 하드코딩이 아니라 산식 파생값이다 (거실 6.3 등)', () => {
    expect(ROOMS.AC_001.cool).toBeCloseTo(6.3) // 거실 31.89㎡ × 170kcal × 1.163
    expect(ROOMS.AC_002.cool).toBeCloseTo(3.2) // 침실1 18.5㎡ × 150kcal
    expect(ROOMS.AC_003.cool).toBeCloseTo(5.6) // 회의실 28.5㎡ × 170kcal
    expect(ROOMS.AC_004.cool).toBeCloseTo(8.8) // 사무실 42.0㎡ × 180kcal
    expect(ROOMS.AC_005.cool).toBeCloseTo(11.5) // 로비 55.0㎡ × 180kcal
    expect(ROOMS.AC_006.cool).toBeCloseTo(2.1) // 탕비실 12.0㎡ × 150kcal
  })

  it('모든 실의 cool이 장비선정표 엑셀 산식과 일치한다 (0.1kW 반올림)', () => {
    for (const r of Object.values(ROOMS)) {
      const expected = Math.round((r.area * DEFAULT_UNIT_LOADS[r.usage].cool * 1.163) / 100) / 10
      expect(r.cool).toBeCloseTo(expected)
    }
  })
})

describe('ODU_CATALOG 확장 필드 (난방·HP·조합비범위)', () => {
  const byModel = (m: string) => ODU_CATALOG.find((e) => e.model === m)!

  it('난방용량(heatKw)과 마력(hp)이 기재된다', () => {
    expect(byModel('RPUW08BX9E')).toMatchObject({ heatKw: 25.1, hp: 8 })
    expect(byModel('RPUW12BX9M')).toMatchObject({ heatKw: 39.0, hp: 12 })
    expect(byModel('RPUW16BX9M')).toMatchObject({ heatKw: 50.4, hp: 16 })
    expect(byModel('RPUW20BX9P')).toMatchObject({ heatKw: 63.8, hp: 20 })
    expect(byModel('GPUW280C2S')).toMatchObject({ heatKw: 31.4, hp: 10 })
    expect(byModel('GPUW450C2S')).toMatchObject({ heatKw: 50.4, hp: 16 })
  })

  it('냉방전용 모델은 heatKw가 null이다', () => {
    expect(byModel('RPUQ141X9S').heatKw).toBeNull()
    expect(byModel('RPUQ141X9S').hp).toBe(14)
  })

  it('comboMin/Max는 정책 미확정으로 전부 미지정(기본 0.5~1.3 적용 대상)', () => {
    for (const e of ODU_CATALOG) {
      expect(e.comboMin).toBeUndefined()
      expect(e.comboMax).toBeUndefined()
    }
  })
})

describe('INITIAL_GROUPS 재튜닝 (설계부하 기준 조합비 정상 범위)', () => {
  const groupRatio = (key: string): number => {
    const g = INITIAL_GROUPS.find((x) => x.key === key)!
    const spec = ODU_CATALOG.find((e) => e.model === g.model)!
    return ratioOf({ items: g.items, cool: spec.cool })
  }

  it('ODU1은 RPUW08BX9E로 조합비가 0.5~1.3 범위 안이다 (≈0.63)', () => {
    const g1 = INITIAL_GROUPS.find((x) => x.key === 'ODU1')!
    expect(g1.model).toBe('RPUW08BX9E')
    const r = groupRatio('ODU1')
    expect(r).toBeGreaterThanOrEqual(0.5)
    expect(r).toBeLessThanOrEqual(1.3)
    expect(r).toBeCloseTo(0.63, 1)
  })

  it('ODU2는 RPUW12BX9M으로 조합비가 0.5~1.3 범위 안이다', () => {
    const g2 = INITIAL_GROUPS.find((x) => x.key === 'ODU2')!
    expect(g2.model).toBe('RPUW12BX9M')
    const r = groupRatio('ODU2')
    expect(r).toBeGreaterThanOrEqual(0.5)
    expect(r).toBeLessThanOrEqual(1.3)
  })
})

describe('outdoorIdxByModel (그룹 실외기 → 카드 하이라이트)', () => {
  it('모델 코드가 카드 목록에 있으면 그 인덱스를 반환한다', () => {
    const model = MODELS.out[1].mn
    expect(outdoorIdxByModel(model)).toBe(1)
  })

  it('목록에 없는 모델이면 -1을 반환한다', () => {
    expect(outdoorIdxByModel('NON_EXISTENT_MODEL')).toBe(-1)
  })
})

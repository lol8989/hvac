import { ComboRange } from './domain/shared/ComboRange'
import { describe, it, expect } from 'vitest'
import { recommendedIndoorIdx, outdoorIdxByModel, ratioOf, indoorCoolByModel, MODELS, ROOMS, INITIAL_GROUPS, INITIAL_POOL, DEFAULT_COMBINATION } from './data'
import type { ModelCard } from './data'
import { DEFAULT_UNIT_LOADS } from './domain/shared/UnitLoad'
import { InMemoryOutdoorModelCatalog } from './infrastructure/generation/InMemoryOutdoorModelCatalog'

// 부하 근사 매칭용 목업 카드(용량만 의미 있음)
const cards: ModelCard[] = [
  { mn: 'A', ms: '', md: '', on: false, cool: 2.64 },
  { mn: 'B', ms: '', md: '', on: false, cool: 4.0 },
  { mn: 'C', ms: '', md: '', on: false, cool: 6.0 },
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

// 실외기 스펙(heatKw/hp/comboMin 등) 데이터 검증은 SSOT인 장비마스터로 이관됨:
// → src/infrastructure/equipment/InMemoryEquipmentMaster.test.ts

describe('초기 배정 시드 제거 (초기 상태는 빈/0 — NEXT #2·#3)', () => {
  it('INITIAL_GROUPS는 실외기 그룹만 제안하고 실내기를 사전배정하지 않는다(items 전부 빈 배열)', () => {
    for (const g of INITIAL_GROUPS) expect(g.items).toEqual([])
  })

  it('INITIAL_POOL은 비어 있다 (미배정 상수 1 제거)', () => {
    expect(INITIAL_POOL).toEqual([])
  })
})

describe('DEFAULT_COMBINATION (combine 진입 시 자동 조합 기본값)', () => {
  // 실외기 스펙은 장비마스터 참조 카탈로그(PUBLISHED)로 조회한다.
  const outdoor = new InMemoryOutdoorModelCatalog()
  const specOfGroup = (key: string) => {
    const model = INITIAL_GROUPS.find((g) => g.key === key)!.model
    return outdoor.findByModel(model)!
  }

  it('전 실을 빠짐없이 배정한다(미배정 없음)', () => {
    const assigned = DEFAULT_COMBINATION.flatMap((c) => c.items).sort()
    expect(assigned).toEqual(Object.keys(ROOMS).sort())
  })

  it('실은 정확히 한 그룹에만 배정된다(중복 금지)', () => {
    const assigned = DEFAULT_COMBINATION.flatMap((c) => c.items)
    expect(new Set(assigned).size).toBe(assigned.length)
  })

  it('실의 계열이 배정 그룹 실외기 계열과 일치한다(계열 호환)', () => {
    for (const c of DEFAULT_COMBINATION) {
      const spec = specOfGroup(c.key)
      for (const id of c.items) expect(ROOMS[id].sys).toBe(spec.energySource)
    }
  })

  it('각 그룹의 설계부하 기준 조합비가 전역 기본 허용범위(0.5~1.03) 안이다', () => {
    for (const c of DEFAULT_COMBINATION) {
      if (!c.items.length) continue
      const spec = specOfGroup(c.key)
      const r = ratioOf({ items: c.items, cool: spec.capacityKw })
      expect(ComboRange.DEFAULT.contains(r)).toBe(true)
    }
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

import { describe, it, expect } from 'vitest'
import { recommendedIndoorIdx, outdoorIdxByModel, indoorCoolByModel, MODELS, ROOMS, DEFAULT_FACILITY } from './data'
import type { ModelCard } from './data'
import { lookupUnitLoadKcal } from './domain/shared/unitLoadTable'
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

  // 프로젝트 기본 시설군은 OFFICE. 목업 도면의 거실·침실·로비·탕비실은 OFFICE 표에 없어 기본 150kcal로 떨어진다.
  it('cool(kW)은 하드코딩이 아니라 산식 파생값이다 (LG 단위부하표 기준)', () => {
    expect(ROOMS.AC_001.cool).toBeCloseTo(5.6) // 거실 31.89㎡ × 150kcal(기본) × 1.163
    expect(ROOMS.AC_002.cool).toBeCloseTo(3.2) // 침실1 18.5㎡ × 150kcal(기본)
    expect(ROOMS.AC_003.cool).toBeCloseTo(5.0) // 회의실 28.5㎡ × 150kcal
    expect(ROOMS.AC_004.cool).toBeCloseTo(7.3) // 사무실 42.0㎡ × 150kcal
    expect(ROOMS.AC_005.cool).toBeCloseTo(9.6) // 로비 55.0㎡ × 150kcal(기본)
    expect(ROOMS.AC_006.cool).toBeCloseTo(2.1) // 탕비실 12.0㎡ × 150kcal(기본)
  })

  it('모든 실의 cool이 단위부하 산식과 일치한다 (0.1kW 반올림)', () => {
    for (const r of Object.values(ROOMS)) {
      const expected = Math.round((r.area * lookupUnitLoadKcal(DEFAULT_FACILITY, r.usage) * 1.163) / 100) / 10
      expect(r.cool).toBeCloseTo(expected)
    }
  })
})

// 실외기 스펙(heatKw/hp/comboMin 등) 데이터 검증은 SSOT인 장비마스터로 이관됨:
// → src/infrastructure/equipment/InMemoryEquipmentMaster.test.ts

// 실외기 그룹·조합 상수(INITIAL_GROUPS / DEFAULT_COMBINATION / INITIAL_POOL)는 제거됐다.
// 실외기 대수·모델·매핑은 목업 배열이 아니라 selectOutdoorUnits(정격 총용량 기반)의 결과다.
// → src/domain/generation/selectOutdoorUnits.test.ts

describe('생성단 실외기 카탈로그 (장비마스터 PUBLISHED 참조)', () => {
  it('게시된 실외기만 노출하고, 최소 한 종의 EHP 후보가 있다', () => {
    const specs = new InMemoryOutdoorModelCatalog().list()
    expect(specs.length).toBeGreaterThan(0)
    expect(specs.some((s) => s.energySource === 'EHP')).toBe(true)
  })

  it('모든 후보가 조합비 허용범위를 갖는다(정책 미지정 시 기본값)', () => {
    for (const s of new InMemoryOutdoorModelCatalog().list()) {
      expect(s.comboRange.min).toBeGreaterThan(0)
      expect(s.comboRange.max).toBeGreaterThanOrEqual(s.comboRange.min)
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

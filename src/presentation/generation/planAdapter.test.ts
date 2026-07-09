import { describe, it, expect } from 'vitest'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta, specGradeText, ensureRoomsInPool, autoCombine } from './planAdapter'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { OutdoorModelSpec } from '../../application/generation/ports'
import { InMemoryOutdoorModelCatalog } from '../../infrastructure/generation/InMemoryOutdoorModelCatalog'
import { ROOMS, DEFAULT_COMBINATION } from '../../data'
import { ComboRange } from '../../domain/shared/ComboRange'

describe('planAdapter (목업 ↔ 도메인/뷰모델 어댑터, 장비마스터 스펙 주입)', () => {
  const catalog = new InMemoryOutdoorModelCatalog()

  it('bootstrapPlan은 실외기 그룹만 제안하고 실내기는 사전배정하지 않는다(초기 빈 상태)', () => {
    const plan = bootstrapPlan()
    expect(plan).toBeInstanceOf(AssignmentPlan)
    // 그룹(실외기 제안)은 존재하되 연결된 실내기는 없다.
    expect(plan.groups.map((g) => g.key).sort()).toEqual(['ODU1', 'ODU2', 'ODU3'])
    for (const g of plan.groups) expect(g.indoorUnits).toEqual([])
    // 미배정 풀도 비어 있다(검출/배치 전에는 실내기가 없다).
    expect(plan.pool).toEqual([])
  })

  it('bootstrapPlan은 실외기 maxConnections를 장비마스터 카탈로그 스펙에서 주입한다', () => {
    const plan = bootstrapPlan(catalog)
    const spec = catalog.findByModel('RPUW08BX9E')!
    const odu = plan.groupByKey('ODU1')!.outdoorUnit
    expect(odu.maxConnections).toBe(spec.maxConnections)
    // 기본값(16) 하드코딩이 아니라 모델 스펙 값이 주입됨을 확인
    expect(odu.maxConnections).not.toBe(16)
  })

  it('toViewModel은 컴포넌트가 기대하는 레거시 뷰 형태를 반환한다(초기 items·pool 비어 있음)', () => {
    const vm = toViewModel(bootstrapPlan())
    const g1 = vm.groups.find((g) => g.key === 'ODU1')
    expect(g1).toMatchObject({
      key: 'ODU1',
      label: '실외기-1',
      model: 'RPUW08BX9E',
      cat: '냉난방 절환형',
      sys: 'EHP',
      cool: 22.4,
    })
    expect(g1!.items).toEqual([])
    expect(vm.pool).toEqual([])
  })

  it('outdoorUnitFromSpec은 마스터 스펙을 OutdoorUnit VO로 변환하고 maxConnections를 주입한다', () => {
    const spec = catalog.findByModel('GPUW280C2S')!
    const odu = outdoorUnitFromSpec(spec)
    expect(odu).toBeInstanceOf(OutdoorUnit)
    expect(odu.model.value).toBe('GPUW280C2S')
    expect(odu.energySource.code).toBe('GHP')
    expect(odu.capacity.kw).toBe(82.0)
    expect(odu.maxConnections).toBe(spec.maxConnections)
  })

  it('toViewModel은 그룹별 등급 표시 문자열을 채운다(모달 카드용)', () => {
    const vm = toViewModel(bootstrapPlan())
    const g1 = vm.groups.find((g) => g.key === 'ODU1')! // RPUW08BX9E
    expect(g1.gradeText).toBe('2등급')
    expect(g1.effText).toBe('EERa 5.10') // EHP는 전기식 EER
  })

  it('계열별 효율 지표 라벨을 구분한다 — GHP는 EERa가 아닌 COPc로 표기', () => {
    const vm = toViewModel(bootstrapPlan())
    const g3 = vm.groups.find((g) => g.key === 'ODU3')! // GPUW280C2S (GHP)
    expect(g3.sys).toBe('GHP')
    expect(g3.effText).toBe('COPc 1.55')
    expect(g3.effText?.startsWith('EERa')).toBe(false)
  })

  it('specGradeText는 스펙에서 표시 문자열을 만든다', () => {
    const spec = catalog.findByModel('RPUW20BX9P')!
    expect(specGradeText(spec)).toBe('3등급')
  })


  it('outdoorUnitFromSpec은 스펙의 comboRange를 OutdoorUnit에 전달한다', () => {
    const range = new ComboRange(0.32, 1.0) // 예: DOAS 하한 완화 정책
    const spec: OutdoorModelSpec = { model: 'TESTCOMBO', category: '테스트', energySource: 'EHP', capacityKw: 30, maxConnections: 10, heatKw: null, hp: 10, comboRange: range }
    expect(outdoorUnitFromSpec(spec).comboRange.equals(range)).toBe(true)
    // 카탈로그 목업은 정책 미지정 → 기본 범위가 전달된다
    const fromCatalog = outdoorUnitFromSpec(catalog.findByModel('RPUW08BX9E')!)
    expect(fromCatalog.comboRange.equals(ComboRange.DEFAULT)).toBe(true)
  })

  it('[통합] 주입된 maxConnections가 OutdoorGroup의 MAX_CONNECTIONS 불변식을 구동한다', () => {
    const spec: OutdoorModelSpec = { model: 'TESTMAX2', category: '테스트', energySource: 'EHP', capacityKw: 30, maxConnections: 2, heatKw: null, hp: 10, comboRange: ComboRange.DEFAULT }
    const idu = (id: string) => new IndoorUnit({ id, roomName: id, coolKw: 5, sys: 'EHP' })
    const g = new OutdoorGroup({ key: 'ODU9', label: 't', outdoorUnit: outdoorUnitFromSpec(spec) })
      .assign(idu('A'))
      .assign(idu('B'))
    // 스펙상 최대 2대 → 3번째 배정은 거부된다
    expect(g.canAssign(idu('C'))).toMatchObject({ ok: false, reason: 'MAX_CONNECTIONS' })
  })

  it('nextGroupMeta는 기존 키 다음 번호의 그룹 메타를 만든다', () => {
    const plan = bootstrapPlan() // ODU1, ODU2, ODU3
    expect(nextGroupMeta(plan)).toEqual({ key: 'ODU4', label: '실외기-4' })
  })

  describe('ensureRoomsInPool (실내기 배치 결과 → 미배정 풀 편입)', () => {
    it('플랜에 없던 실을 미배정 풀에 IndoorUnit으로 추가한다', () => {
      const plan = bootstrapPlan(catalog) // 빈 풀
      const next = ensureRoomsInPool(plan, ['AC_001', 'AC_002'])
      expect(next.pool.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_002'])
      // 그룹은 그대로(빈 상태) 보존
      for (const g of next.groups) expect(g.indoorUnits).toEqual([])
    })

    it('이미 어딘가(그룹/풀)에 있는 실은 중복 추가하지 않는다', () => {
      const seeded = ensureRoomsInPool(bootstrapPlan(catalog), ['AC_001'])
      const again = ensureRoomsInPool(seeded, ['AC_001', 'AC_003'])
      expect(again.pool.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_003'])
    })

    it('추가할 실이 없으면 동일 플랜을 그대로 반환한다(불변)', () => {
      const seeded = ensureRoomsInPool(bootstrapPlan(catalog), ['AC_001'])
      expect(ensureRoomsInPool(seeded, ['AC_001'])).toBe(seeded)
    })
  })

  describe('autoCombine (combine 진입 시 기본 조합 적용)', () => {
    it('풀의 전 실을 DEFAULT_COMBINATION 매핑대로 그룹에 배정한다(미배정 0)', () => {
      const detected = ensureRoomsInPool(bootstrapPlan(catalog), Object.keys(ROOMS))
      const combined = autoCombine(detected, DEFAULT_COMBINATION)
      expect(combined.pool).toEqual([])
      for (const c of DEFAULT_COMBINATION) {
        const g = combined.groupByKey(c.key)!
        expect(g.indoorUnits.map((i) => i.id).sort()).toEqual([...c.items].sort())
      }
    })

    it('풀에 없는 실은 건너뛴다(방어적 — 부분 검출 상황)', () => {
      const detected = ensureRoomsInPool(bootstrapPlan(catalog), ['AC_001', 'AC_003'])
      const combined = autoCombine(detected, DEFAULT_COMBINATION)
      // AC_001·AC_003만 배정되고 나머지는 매핑에 있어도 풀에 없어 무시된다.
      expect(combined.groupByKey('ODU1')!.indoorUnits.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_003'])
      expect(combined.pool).toEqual([])
    })
  })
})

import { describe, it, expect } from 'vitest'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta, specPriceText, specGradeText } from './planAdapter'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { OutdoorModelSpec } from '../../application/generation/ports'
import { InMemoryOutdoorModelCatalog } from '../../infrastructure/generation/InMemoryOutdoorModelCatalog'
import { MODELS } from '../../data'

describe('planAdapter (목업 ↔ 도메인/뷰모델 어댑터, 장비마스터 스펙 주입)', () => {
  const catalog = new InMemoryOutdoorModelCatalog()

  it('bootstrapPlan은 초기 배치를 AssignmentPlan으로 만든다', () => {
    const plan = bootstrapPlan()
    expect(plan).toBeInstanceOf(AssignmentPlan)
    expect(plan.groupByKey('ODU1')!.indoorUnits.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_003', 'AC_006'])
    expect(plan.locationOf('AC_002')).toBe('pool')
  })

  it('bootstrapPlan은 실외기 maxConnections를 장비마스터 카탈로그 스펙에서 주입한다', () => {
    const plan = bootstrapPlan(catalog)
    const spec = catalog.findByModel('RPUW12BX9M')!
    const odu = plan.groupByKey('ODU1')!.outdoorUnit
    expect(odu.maxConnections).toBe(spec.maxConnections)
    // 기본값(16) 하드코딩이 아니라 모델 스펙 값이 주입됨을 확인
    expect(odu.maxConnections).not.toBe(16)
  })

  it('toViewModel은 컴포넌트가 기대하는 레거시 뷰 형태를 반환한다', () => {
    const vm = toViewModel(bootstrapPlan())
    const g1 = vm.groups.find((g) => g.key === 'ODU1')
    expect(g1).toMatchObject({
      key: 'ODU1',
      label: '실외기-1',
      model: 'RPUW12BX9M',
      cat: '냉난방 절환형',
      sys: 'EHP',
      cool: 34.8,
    })
    expect(g1!.items.sort()).toEqual(['AC_001', 'AC_003', 'AC_006'])
    expect(vm.pool).toEqual(['AC_002'])
  })

  it('outdoorUnitFromSpec은 마스터 스펙을 OutdoorUnit VO로 변환하고 maxConnections를 주입한다', () => {
    const spec = catalog.findByModel('GPUW280C2S')!
    const odu = outdoorUnitFromSpec(spec)
    expect(odu).toBeInstanceOf(OutdoorUnit)
    expect(odu.model.value).toBe('GPUW280C2S')
    expect(odu.energySource.code).toBe('GHP')
    expect(odu.capacity.kw).toBe(28.0)
    expect(odu.maxConnections).toBe(spec.maxConnections)
  })

  it('toViewModel은 단가/등급 표시 문자열과 리포트 집계를 채운다', () => {
    const vm = toViewModel(bootstrapPlan())
    const g1 = vm.groups.find((g) => g.key === 'ODU1')!
    expect(g1.priceText).toBe('4,120,000원')
    expect(g1.gradeText).toBe('3등급')
    expect(g1.effText).toBe('EERa 4.99') // EHP는 전기식 EER
    // 활성 실외기 ODU1(4.12M)+ODU2(6.35M) 합, ODU3(빈 그룹) 제외
    expect(vm.report.totalOutdoorPriceText).toBe('10,470,000원')
    expect(vm.report.unpricedCount).toBe(0)
  })

  it('계열별 효율 지표 라벨을 구분한다 — GHP는 EERa가 아닌 COPc로 표기', () => {
    const vm = toViewModel(bootstrapPlan())
    const g3 = vm.groups.find((g) => g.key === 'ODU3')! // GPUW280C2S (GHP)
    expect(g3.sys).toBe('GHP')
    expect(g3.effText).toBe('COPc 1.55')
    expect(g3.effText?.startsWith('EERa')).toBe(false)
  })

  it('specPriceText/specGradeText는 스펙에서 표시 문자열을 만든다', () => {
    const spec = catalog.findByModel('RPUW20BX9P')!
    expect(specPriceText(spec)).toBe('6,350,000원')
    expect(specGradeText(spec)).toBe('3등급')
  })

  it('[정합] MODELS.out 실외기 단가 문자열이 ODU_CATALOG 파생 단가와 일치한다(드리프트 방지)', () => {
    for (const m of MODELS.out) {
      const spec = catalog.findByModel(m.mn)
      if (!spec) continue // MODELS.out은 카탈로그의 부분집합
      expect(specPriceText(spec)).toBe(m.mp)
    }
  })

  it('[통합] 주입된 maxConnections가 OutdoorGroup의 MAX_CONNECTIONS 불변식을 구동한다', () => {
    const spec: OutdoorModelSpec = { model: 'TESTMAX2', category: '테스트', energySource: 'EHP', capacityKw: 30, maxConnections: 2 }
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
})

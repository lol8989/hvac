import { describe, it, expect } from 'vitest'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta } from './planAdapter'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { OutdoorModelSpec } from '../../application/generation/ports'
import { InMemoryOutdoorModelCatalog } from '../../infrastructure/generation/InMemoryOutdoorModelCatalog'

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

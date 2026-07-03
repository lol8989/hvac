import { describe, it, expect } from 'vitest'
import { bootstrapPlan, toViewModel, outdoorUnitFromCatalog, nextGroupMeta } from './planAdapter.js'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan.js'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit.js'
import { ODU_CATALOG } from '../../data.js'

describe('planAdapter (data.js 목업 ↔ 도메인/뷰모델 어댑터)', () => {
  it('bootstrapPlan은 data.js 초기 상태로 AssignmentPlan을 만든다', () => {
    const plan = bootstrapPlan()
    expect(plan).toBeInstanceOf(AssignmentPlan)
    expect(plan.groupByKey('ODU1').indoorUnits.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_003', 'AC_006'])
    expect(plan.locationOf('AC_002')).toBe('pool')
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
    expect(g1.items.sort()).toEqual(['AC_001', 'AC_003', 'AC_006'])
    expect(vm.pool).toEqual(['AC_002'])
  })

  it('outdoorUnitFromCatalog은 카탈로그 항목을 OutdoorUnit VO로 변환한다', () => {
    const cat = ODU_CATALOG.find((c) => c.model === 'GPUW280C2S')
    const odu = outdoorUnitFromCatalog(cat)
    expect(odu).toBeInstanceOf(OutdoorUnit)
    expect(odu.model.value).toBe('GPUW280C2S')
    expect(odu.energySource.code).toBe('GHP')
    expect(odu.capacity.kw).toBe(28.0)
  })

  it('nextGroupMeta는 기존 키 다음 번호의 그룹 메타를 만든다', () => {
    const plan = bootstrapPlan() // ODU1, ODU2, ODU3
    expect(nextGroupMeta(plan)).toEqual({ key: 'ODU4', label: '실외기-4' })
  })
})

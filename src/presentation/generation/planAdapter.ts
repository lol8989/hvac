// 프리젠테이션 어댑터: 목업 배치(data.ts) ↔ 도메인(AssignmentPlan) ↔ 컴포넌트 뷰모델.
// 실외기 스펙(계열·용량·최대 연결 수)은 장비마스터 카탈로그 포트에서 조회해 주입한다.
//   → OutdoorGroup의 MAX_CONNECTIONS 불변식이 모델별 실제 스펙을 반영한다.
// 목적은 "동작 보존" — 컴포넌트가 기대하는 레거시 뷰 형태
//   groups: [{ key, label, model, cat, sys, cool, items:[roomId] }], pool: [roomId]
// 를 그대로 만들어 컴포넌트를 수정하지 않고 내부 로직만 도메인 유즈케이스로 교체한다.

import { ROOMS, INITIAL_GROUPS, INITIAL_POOL } from '../../data'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import type { GroupMeta } from '../../domain/generation/OutdoorGroup'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { EnergySourceCode } from '../../domain/shared/EnergySource'
import type { OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'
import { InMemoryOutdoorModelCatalog } from '../../infrastructure/generation/InMemoryOutdoorModelCatalog'

// 컴포넌트가 소비하는 레거시 뷰 형태
export interface GroupView {
  key: string
  label: string
  model: string
  cat: string
  sys: EnergySourceCode
  cool: number
  items: string[]
}

export interface ViewModel {
  groups: GroupView[]
  pool: string[]
}

// roomId → IndoorUnit (ROOMS 목업에서 도메인 엔티티 생성)
const indoorFromRoom = (id: string): IndoorUnit => {
  const r = ROOMS[id]
  return new IndoorUnit({ id, roomName: r.name, coolKw: r.cool, sys: r.sys })
}

// 장비마스터 스펙(OutdoorModelSpec) → OutdoorUnit VO. maxConnections를 주입한다.
export const outdoorUnitFromSpec = (spec: OutdoorModelSpec): OutdoorUnit =>
  new OutdoorUnit({
    model: spec.model,
    category: spec.category,
    sys: spec.energySource,
    capacityKw: spec.capacityKw,
    maxConnections: spec.maxConnections,
  })

// 초기 배치(INITIAL_GROUPS: 모델+연결)를 카탈로그 스펙으로 해석해 AssignmentPlan 부트스트랩
export const bootstrapPlan = (catalog: OutdoorModelCatalog = new InMemoryOutdoorModelCatalog()): AssignmentPlan => {
  const groups = INITIAL_GROUPS.map((g) => {
    const spec = catalog.findByModel(g.model)
    if (!spec) throw new Error(`장비마스터 카탈로그에 없는 실외기 모델: ${g.model}`)
    return new OutdoorGroup({
      key: g.key,
      label: g.label,
      outdoorUnit: outdoorUnitFromSpec(spec),
      indoorUnits: g.items.map(indoorFromRoom),
    })
  })
  const pool = INITIAL_POOL.map(indoorFromRoom)
  return new AssignmentPlan({ groups, pool })
}

// AssignmentPlan → 컴포넌트가 소비하는 레거시 뷰 형태
export const toViewModel = (plan: AssignmentPlan): ViewModel => ({
  groups: plan.groups.map((g) => ({
    key: g.key,
    label: g.label,
    model: g.outdoorUnit.model.value,
    cat: g.outdoorUnit.category,
    sys: g.outdoorUnit.energySource.code,
    cool: g.outdoorUnit.capacity.kw,
    items: g.indoorUnits.map((i) => i.id),
  })),
  pool: plan.pool.map((i) => i.id),
})

// 기존 키(ODU_n) 다음 번호의 새 그룹 메타
export const nextGroupMeta = (plan: AssignmentPlan): GroupMeta => {
  const nums = plan.groups.map((g) => parseInt(g.key.replace('ODU', ''), 10) || 0)
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  return { key: 'ODU' + n, label: '실외기-' + n }
}

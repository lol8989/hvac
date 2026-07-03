// 프리젠테이션 어댑터: data.js 목업 ↔ 도메인(AssignmentPlan) ↔ 컴포넌트 뷰모델.
// 목적은 "동작 보존" — 기존 컴포넌트가 기대하는 레거시 뷰 형태
//   groups: [{ key, label, model, cat, sys, cool, items:[roomId] }], pool: [roomId]
// 를 그대로 만들어 컴포넌트를 수정하지 않고 내부 로직만 도메인 유즈케이스로 교체한다.

import { ROOMS, INITIAL_GROUPS, INITIAL_POOL } from '../../data.js'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan.js'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup.js'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit.js'
import { IndoorUnit } from '../../domain/generation/IndoorUnit.js'

// roomId → IndoorUnit (ROOMS 목업에서 도메인 엔티티 생성)
const indoorFromRoom = (id) => {
  const r = ROOMS[id]
  return new IndoorUnit({ id, roomName: r.name, coolKw: r.cool, sys: r.sys })
}

// data.js 그룹/카탈로그 항목({ model, cat, sys, cool }) → OutdoorUnit VO
export const outdoorUnitFromCatalog = (cat) =>
  new OutdoorUnit({ model: cat.model, category: cat.cat, sys: cat.sys, capacityKw: cat.cool })

// data.js 초기 상태로 AssignmentPlan 부트스트랩
export const bootstrapPlan = () => {
  const groups = INITIAL_GROUPS.map(
    (g) =>
      new OutdoorGroup({
        key: g.key,
        label: g.label,
        outdoorUnit: outdoorUnitFromCatalog(g),
        indoorUnits: g.items.map(indoorFromRoom),
      }),
  )
  const pool = INITIAL_POOL.map(indoorFromRoom)
  return new AssignmentPlan({ groups, pool })
}

// AssignmentPlan → 컴포넌트가 소비하는 레거시 뷰 형태
export const toViewModel = (plan) => ({
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
export const nextGroupMeta = (plan) => {
  const nums = plan.groups.map((g) => parseInt(g.key.replace('ODU', ''), 10) || 0)
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  return { key: 'ODU' + n, label: '실외기-' + n }
}

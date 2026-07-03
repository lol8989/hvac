// 유즈케이스: 실외기 그룹 관리 명령 (추가/삭제/분할).
// 각 유즈케이스는 포트(planRepository)에만 의존하며 성공 시 저장하고 도메인 이벤트를 반환한다.
// 참조 오류(NotFoundError)는 도메인에서 던져져 전파된다.

import { groupAdded, groupRemoved, groupSplit } from '../../domain/generation/events'
import type { GroupAdded, GroupRemoved, GroupSplit } from '../../domain/generation/events'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { GroupMeta } from '../../domain/generation/OutdoorGroup'
import type { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import type { PlanRepository } from './ports'

type Deps = { planRepository: PlanRepository }

export interface AddGroupCommand {
  meta: GroupMeta
  outdoorUnit: OutdoorUnit
}
export interface AddGroupResult {
  ok: true
  plan: AssignmentPlan
  event: GroupAdded
}

export function makeAddGroup({ planRepository }: Deps) {
  return function execute({ meta, outdoorUnit }: AddGroupCommand): AddGroupResult {
    const next = planRepository.load().addGroup({ meta, outdoorUnit })
    planRepository.save(next)
    return { ok: true, plan: next, event: groupAdded({ key: meta.key, model: outdoorUnit.model.value }) }
  }
}

export interface RemoveGroupCommand {
  key: string
}
export interface RemoveGroupResult {
  ok: true
  plan: AssignmentPlan
  released: IndoorUnit[]
  event: GroupRemoved
}

export function makeRemoveGroup({ planRepository }: Deps) {
  return function execute({ key }: RemoveGroupCommand): RemoveGroupResult {
    const { plan: next, released } = planRepository.load().removeGroup(key)
    planRepository.save(next)
    return { ok: true, plan: next, released, event: groupRemoved({ key, releasedIds: released.map((i) => i.id) }) }
  }
}

export interface SplitGroupCommand {
  key: string
  meta: GroupMeta
}
export interface SplitGroupResult {
  ok: true
  plan: AssignmentPlan
  event: GroupSplit
}

export function makeSplitGroup({ planRepository }: Deps) {
  return function execute({ key, meta }: SplitGroupCommand): SplitGroupResult {
    const next = planRepository.load().split(key, meta)
    planRepository.save(next)
    return { ok: true, plan: next, event: groupSplit({ fromKey: key, newKey: meta.key }) }
  }
}

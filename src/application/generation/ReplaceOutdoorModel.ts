// 유즈케이스: 실외기 그룹의 모델을 교체한다.
// 계열이 바뀌어 호환되지 않는 실내기는 도메인에서 풀로 방출되며, 방출 목록을 이벤트에 담는다.

import { outdoorModelReplaced } from '../../domain/generation/events'
import type { OutdoorModelReplaced } from '../../domain/generation/events'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import type { PlanRepository } from './ports'

export interface ReplaceModelCommand {
  key: string
  outdoorUnit: OutdoorUnit
}

export interface ReplaceModelResult {
  ok: true
  plan: AssignmentPlan
  ejected: IndoorUnit[]
  event: OutdoorModelReplaced
}

export function makeReplaceOutdoorModel({ planRepository }: { planRepository: PlanRepository }) {
  return function execute({ key, outdoorUnit }: ReplaceModelCommand): ReplaceModelResult {
    const plan = planRepository.load()
    const { plan: next, ejected } = plan.replaceModel(key, outdoorUnit)
    planRepository.save(next)
    return {
      ok: true,
      plan: next,
      ejected,
      event: outdoorModelReplaced({ key, model: outdoorUnit.model.value, ejectedIds: ejected.map((i) => i.id) }),
    }
  }
}

// 유즈케이스: 실내기를 다른 그룹/미배정 풀로 재배정한다.
// 포트(planRepository)에만 의존. 도메인 규칙 위반(계열/최대수/중복)은 거부 결과로 변환하고,
// 참조 오류(NotFoundError)는 전파한다. 성공 시 저장하고 도메인 이벤트를 반환한다.

import { AssignmentRejected } from '../../domain/generation/errors'
import type { AssignReason } from '../../domain/generation/errors'
import { indoorUnitReassigned } from '../../domain/generation/events'
import type { IndoorUnitReassigned } from '../../domain/generation/events'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { PlanRepository } from './ports'

export interface ReassignCommand {
  indoorId: string
  to: string
}

export type ReassignResult =
  | { ok: true; plan: AssignmentPlan; event: IndoorUnitReassigned }
  | { ok: false; reason: AssignReason }

export function makeReassignIndoorUnit({ planRepository }: { planRepository: PlanRepository }) {
  return function execute({ indoorId, to }: ReassignCommand): ReassignResult {
    const plan = planRepository.load()
    const from = plan.locationOf(indoorId)
    try {
      const next = plan.reassign(indoorId, to)
      planRepository.save(next)
      return { ok: true, plan: next, event: indoorUnitReassigned({ indoorId, from, to }) }
    } catch (e) {
      if (e instanceof AssignmentRejected) return { ok: false, reason: e.reason }
      throw e
    }
  }
}

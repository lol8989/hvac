// 유즈케이스: 실(그 실의 모든 실내기 대수)을 다른 그룹/미배정 풀로 재배정한다.
// 포트(planRepository)에만 의존. 도메인 규칙 위반(계열/최대 연결 대수/중복)은 거부 결과로 변환하고,
// 참조 오류(NotFoundError)는 전파한다. 성공 시 저장하고 도메인 이벤트를 반환한다.
//
// 이동 단위가 실인 이유: 한 실의 대수가 서로 다른 실외기로 갈라지면
// 선정표의 실 행이 실외기를 하나로 특정할 수 없다(AssignmentPlan 불변식 ②).

import { AssignmentRejected } from '../../domain/generation/errors'
import type { AssignReason } from '../../domain/generation/errors'
import { roomReassigned } from '../../domain/generation/events'
import type { RoomReassigned } from '../../domain/generation/events'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { PlanRepository } from './ports'

export interface ReassignRoomCommand {
  roomId: string
  to: string
}

export type ReassignRoomResult =
  | { ok: true; plan: AssignmentPlan; event: RoomReassigned }
  | { ok: false; reason: AssignReason }

export function makeReassignRoom({ planRepository }: { planRepository: PlanRepository }) {
  return function execute({ roomId, to }: ReassignRoomCommand): ReassignRoomResult {
    const plan = planRepository.load()
    const from = plan.roomLocationOf(roomId)
    try {
      const next = plan.reassignRoom(roomId, to)
      planRepository.save(next)
      return { ok: true, plan: next, event: roomReassigned({ roomId, from, to }) }
    } catch (e) {
      if (e instanceof AssignmentRejected) return { ok: false, reason: e.reason }
      throw e
    }
  }
}

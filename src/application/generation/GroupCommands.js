// 유즈케이스: 실외기 그룹 관리 명령 (추가/삭제/분할).
// 각 유즈케이스는 포트(planRepository)에만 의존하며 성공 시 저장하고 도메인 이벤트를 반환한다.
// 참조 오류(NotFoundError)는 도메인에서 던져져 전파된다.

import { groupAdded, groupRemoved, groupSplit } from '../../domain/generation/events.js'

export function makeAddGroup({ planRepository }) {
  return function execute({ meta, outdoorUnit }) {
    const next = planRepository.load().addGroup({ meta, outdoorUnit })
    planRepository.save(next)
    return { ok: true, plan: next, event: groupAdded({ key: meta.key, model: outdoorUnit.model.value }) }
  }
}

export function makeRemoveGroup({ planRepository }) {
  return function execute({ key }) {
    const { plan: next, released } = planRepository.load().removeGroup(key)
    planRepository.save(next)
    return { ok: true, plan: next, released, event: groupRemoved({ key, releasedIds: released.map((i) => i.id) }) }
  }
}

export function makeSplitGroup({ planRepository }) {
  return function execute({ key, meta }) {
    const next = planRepository.load().split(key, meta)
    planRepository.save(next)
    return { ok: true, plan: next, event: groupSplit({ fromKey: key, newKey: meta.key }) }
  }
}

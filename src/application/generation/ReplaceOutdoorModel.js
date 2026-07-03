// 유즈케이스: 실외기 그룹의 모델을 교체한다.
// 계열이 바뀌어 호환되지 않는 실내기는 도메인에서 풀로 방출되며, 방출 목록을 이벤트에 담는다.

import { outdoorModelReplaced } from '../../domain/generation/events.js'

export function makeReplaceOutdoorModel({ planRepository }) {
  return function execute({ key, outdoorUnit }) {
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

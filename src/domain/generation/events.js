// Generation 컨텍스트 도메인 이벤트. 순수 팩토리(부작용 없음).
// 애플리케이션 유즈케이스가 상태 변경 성공 후 발행하며, 프리젠테이션/로깅/후속 처리의 근거가 된다.

export const indoorUnitReassigned = ({ indoorId, from, to }) => ({
  type: 'IndoorUnitReassigned',
  indoorId,
  from,
  to,
})

export const outdoorModelReplaced = ({ key, model, ejectedIds }) => ({
  type: 'OutdoorModelReplaced',
  key,
  model,
  ejectedIds,
})

export const groupAdded = ({ key, model }) => ({ type: 'GroupAdded', key, model })

export const groupRemoved = ({ key, releasedIds }) => ({ type: 'GroupRemoved', key, releasedIds })

export const groupSplit = ({ fromKey, newKey }) => ({ type: 'GroupSplit', fromKey, newKey })

// Generation 컨텍스트 도메인 이벤트. 순수 팩토리(부작용 없음).
// 애플리케이션 유즈케이스가 상태 변경 성공 후 발행하며, 프리젠테이션/로깅/후속 처리의 근거가 된다.

export interface IndoorUnitReassigned {
  type: 'IndoorUnitReassigned'
  indoorId: string
  from: string | null
  to: string
}

export interface OutdoorModelReplaced {
  type: 'OutdoorModelReplaced'
  key: string
  model: string
  ejectedIds: string[]
}

export interface GroupAdded {
  type: 'GroupAdded'
  key: string
  model: string
}

export interface GroupRemoved {
  type: 'GroupRemoved'
  key: string
  releasedIds: string[]
}

export interface GroupSplit {
  type: 'GroupSplit'
  fromKey: string
  newKey: string
}

export type DomainEvent = IndoorUnitReassigned | OutdoorModelReplaced | GroupAdded | GroupRemoved | GroupSplit

export const indoorUnitReassigned = (p: { indoorId: string; from: string | null; to: string }): IndoorUnitReassigned => ({
  type: 'IndoorUnitReassigned',
  indoorId: p.indoorId,
  from: p.from,
  to: p.to,
})

export const outdoorModelReplaced = (p: { key: string; model: string; ejectedIds: string[] }): OutdoorModelReplaced => ({
  type: 'OutdoorModelReplaced',
  key: p.key,
  model: p.model,
  ejectedIds: p.ejectedIds,
})

export const groupAdded = (p: { key: string; model: string }): GroupAdded => ({ type: 'GroupAdded', key: p.key, model: p.model })

export const groupRemoved = (p: { key: string; releasedIds: string[] }): GroupRemoved => ({
  type: 'GroupRemoved',
  key: p.key,
  releasedIds: p.releasedIds,
})

export const groupSplit = (p: { fromKey: string; newKey: string }): GroupSplit => ({
  type: 'GroupSplit',
  fromKey: p.fromKey,
  newKey: p.newKey,
})

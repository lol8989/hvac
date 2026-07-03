// 배정 플랜 (Generation Context) — 실외기 그룹들 + 미배정 풀을 함께 다루는 조율자.
// 교차 불변식: "하나의 실내기는 정확히 한 곳(어느 그룹 또는 풀)에만 존재한다."
// 그룹 내부 불변식(계열/최대수/중복)은 각 OutdoorGroup 애그리거트가 책임지고,
// 이 조율자는 그룹↔풀 사이 이동의 일관성을 책임진다.
//
// 불변(immutable): 모든 변경 메서드는 원본을 바꾸지 않고 새 AssignmentPlan을 반환한다.
// 실패 시 도메인 에러(AssignmentRejected/NotFoundError)를 던지며 원본은 보존된다.

import { OutdoorGroup } from './OutdoorGroup.js'
import { AssignmentRejected, NotFoundError } from './errors.js'

export class AssignmentPlan {
  constructor({ groups = [], pool = [] }) {
    // 교차 불변식 검증: 모든 실내기 id는 전체(그룹+풀)에서 유일해야 한다.
    const seen = new Set()
    const all = [...groups.flatMap((g) => g.indoorUnits), ...pool]
    for (const idu of all) {
      if (seen.has(idu.id)) {
        throw new Error(`실내기 ${idu.id}가 두 위치에 존재합니다(정확히 한 곳 규칙 위반)`)
      }
      seen.add(idu.id)
    }
    this._groups = [...groups]
    this._pool = [...pool]
  }

  get groups() {
    return [...this._groups]
  }

  get pool() {
    return [...this._pool]
  }

  groupByKey(key) {
    return this._groups.find((g) => g.key === key)
  }

  // 실내기가 있는 위치: 그룹 key | 'pool' | null(없음)
  locationOf(indoorId) {
    const g = this._groups.find((x) => x.indoorUnits.some((i) => i.id === indoorId))
    if (g) return g.key
    if (this._pool.some((i) => i.id === indoorId)) return 'pool'
    return null
  }

  indoorById(indoorId) {
    for (const g of this._groups) {
      const found = g.indoorUnits.find((i) => i.id === indoorId)
      if (found) return found
    }
    return this._pool.find((i) => i.id === indoorId)
  }

  // 실내기를 대상(to = 그룹 key 또는 'pool')으로 이동한다.
  reassign(indoorId, to) {
    const from = this.locationOf(indoorId)
    if (from === null) throw new NotFoundError(`실내기를 찾을 수 없습니다: ${indoorId}`)
    if (to !== 'pool' && !this.groupByKey(to)) {
      throw new NotFoundError(`실외기 그룹을 찾을 수 없습니다: ${to}`)
    }
    const indoor = this.indoorById(indoorId)

    // 1) 출발지에서 제거
    let groups = this._groups.map((g) => (g.key === from ? g.unassign(indoorId) : g))
    let pool = from === 'pool' ? this._pool.filter((i) => i.id !== indoorId) : [...this._pool]

    // 2) 도착지에 추가 (그룹이면 canAssign 검사 → 위반 시 AssignmentRejected)
    if (to === 'pool') {
      if (!pool.some((i) => i.id === indoorId)) pool = [...pool, indoor]
    } else {
      const target = groups.find((g) => g.key === to)
      const check = target.canAssign(indoor)
      if (!check.ok) throw new AssignmentRejected(indoorId, check.reason)
      groups = groups.map((g) => (g.key === to ? g.assign(indoor) : g))
    }
    return new AssignmentPlan({ groups, pool })
  }

  // 실외기 모델 교체. 계열이 바뀌어 방출된 실내기는 풀로 이동한다.
  replaceModel(key, newOutdoorUnit) {
    const g = this._requireGroup(key)
    const { group, ejected } = g.replaceModel(newOutdoorUnit)
    const groups = this._groups.map((x) => (x.key === key ? group : x))
    const pool = [...this._pool, ...ejected]
    return { plan: new AssignmentPlan({ groups, pool }), ejected }
  }

  // 그룹 분할: 실내기 절반을 같은 실외기 모델의 새 그룹으로 옮긴다.
  split(key, nextMeta) {
    const g = this._requireGroup(key)
    const { group, newGroup } = g.split(nextMeta)
    const groups = [...this._groups.map((x) => (x.key === key ? group : x)), newGroup]
    return new AssignmentPlan({ groups, pool: this._pool })
  }

  // 빈 실외기 그룹 추가.
  addGroup({ meta, outdoorUnit }) {
    const group = new OutdoorGroup({ key: meta.key, label: meta.label, outdoorUnit, indoorUnits: [] })
    return new AssignmentPlan({ groups: [...this._groups, group], pool: this._pool })
  }

  // 그룹 삭제. 연결된 실내기는 풀로 반환된다.
  removeGroup(key) {
    const g = this._requireGroup(key)
    const released = g.indoorUnits
    const groups = this._groups.filter((x) => x.key !== key)
    const pool = [...this._pool, ...released]
    return { plan: new AssignmentPlan({ groups, pool }), released }
  }

  _requireGroup(key) {
    const g = this.groupByKey(key)
    if (!g) throw new NotFoundError(`실외기 그룹을 찾을 수 없습니다: ${key}`)
    return g
  }
}

// 배정 플랜 (Generation Context) — 실외기 그룹들 + 미배정 풀을 함께 다루는 조율자.
// 교차 불변식:
//   ① 하나의 실내기(유닛)는 정확히 한 곳(어느 그룹 또는 풀)에만 존재한다.
//   ② 한 실의 모든 대수는 같은 곳에 함께 있다 — 선정표의 실 행이 실외기를 정확히 하나 가리켜야 한다.
// 그룹 내부 불변식(계열/최대수/중복)은 각 OutdoorGroup 애그리거트가 책임지고,
// 이 조율자는 그룹↔풀 사이 이동의 일관성을 책임진다.
//
// 이동은 실 단위(reassignRoom)로만 노출한다. 유닛 하나만 옮기면 불변식 ②가 깨진다.
//
// 불변(immutable): 모든 변경 메서드는 원본을 바꾸지 않고 새 AssignmentPlan을 반환한다.
// 실패 시 도메인 에러(AssignmentRejected/NotFoundError)를 던지며 원본은 보존된다.

import { OutdoorGroup } from './OutdoorGroup'
import type { GroupMeta } from './OutdoorGroup'
import type { IndoorUnit } from './IndoorUnit'
import type { OutdoorUnit } from './OutdoorUnit'
import { DEFAULT_PRICE_TYPE } from './OutdoorUnit'
import { AssignmentRejected, NotFoundError } from './errors'
import { Price } from '../shared/Price'

export interface AssignmentPlanProps {
  groups?: OutdoorGroup[]
  pool?: IndoorUnit[]
}

export class AssignmentPlan {
  private readonly _groups: OutdoorGroup[]
  private readonly _pool: IndoorUnit[]

  constructor({ groups = [], pool = [] }: AssignmentPlanProps) {
    // 교차 불변식 ①: 모든 실내기 유닛 id는 전체(그룹+풀)에서 유일해야 한다.
    // 교차 불변식 ②: 한 실의 유닛들은 모두 같은 위치에 있어야 한다.
    const seen = new Set<string>()
    const roomAt = new Map<string, string>()
    const located: [string, IndoorUnit][] = [
      ...groups.flatMap((g) => g.indoorUnits.map((u) => [g.key, u] as [string, IndoorUnit])),
      ...pool.map((u) => ['pool', u] as [string, IndoorUnit]),
    ]
    for (const [where, idu] of located) {
      if (seen.has(idu.id)) {
        throw new Error(`실내기 ${idu.id}가 두 위치에 존재합니다(정확히 한 곳 규칙 위반)`)
      }
      seen.add(idu.id)
      const prev = roomAt.get(idu.roomId)
      if (prev !== undefined && prev !== where) {
        throw new Error(`실 ${idu.roomId}의 실내기가 ${prev}와 ${where}로 갈라져 있습니다(실 응집 규칙 위반)`)
      }
      roomAt.set(idu.roomId, where)
    }
    this._groups = [...groups]
    this._pool = [...pool]
  }

  get groups(): OutdoorGroup[] {
    return [...this._groups]
  }

  get pool(): IndoorUnit[] {
    return [...this._pool]
  }

  groupByKey(key: string): OutdoorGroup | undefined {
    return this._groups.find((g) => g.key === key)
  }

  // 실내기 유닛이 있는 위치: 그룹 key | 'pool' | null(없음)
  locationOf(indoorId: string): string | null {
    const g = this._groups.find((x) => x.indoorUnits.some((i) => i.id === indoorId))
    if (g) return g.key
    if (this._pool.some((i) => i.id === indoorId)) return 'pool'
    return null
  }

  // 실이 있는 위치. 불변식 ②에 의해 그 실의 모든 대수는 같은 곳에 있다.
  roomLocationOf(roomId: string): string | null {
    const g = this._groups.find((x) => x.indoorUnits.some((i) => i.roomId === roomId))
    if (g) return g.key
    if (this._pool.some((i) => i.roomId === roomId)) return 'pool'
    return null
  }

  indoorById(indoorId: string): IndoorUnit | undefined {
    for (const g of this._groups) {
      const found = g.indoorUnits.find((i) => i.id === indoorId)
      if (found) return found
    }
    return this._pool.find((i) => i.id === indoorId)
  }

  // 한 실의 모든 실내기 유닛(어디에 있든).
  unitsOfRoom(roomId: string): IndoorUnit[] {
    const inGroups = this._groups.flatMap((g) => g.indoorUnits.filter((i) => i.roomId === roomId))
    return inGroups.length ? inGroups : this._pool.filter((i) => i.roomId === roomId)
  }

  // 실(그 실의 모든 대수)을 대상(to = 그룹 key 또는 'pool')으로 함께 이동한다.
  // 한 대라도 못 들어가면 아무것도 옮기지 않는다(전부 아니면 전무).
  reassignRoom(roomId: string, to: string): AssignmentPlan {
    const from = this.roomLocationOf(roomId)
    if (from === null) throw new NotFoundError(`실을 찾을 수 없습니다: ${roomId}`)
    if (to !== 'pool' && !this.groupByKey(to)) {
      throw new NotFoundError(`실외기 그룹을 찾을 수 없습니다: ${to}`)
    }
    if (from === to) return this
    const units = this.unitsOfRoom(roomId)

    // 1) 출발지에서 제거
    let groups = this._groups.map((g) => (g.key === from ? g.unassignRoom(roomId) : g))
    let pool = from === 'pool' ? this._pool.filter((i) => i.roomId !== roomId) : [...this._pool]

    // 2) 도착지에 추가 (그룹이면 canAssignMany 검사 → 위반 시 AssignmentRejected)
    if (to === 'pool') {
      pool = [...pool, ...units]
    } else {
      const target = groups.find((g) => g.key === to) as OutdoorGroup
      const check = target.canAssignMany(units)
      if (!check.ok) throw new AssignmentRejected(units[0].id, check.reason)
      groups = groups.map((g) => (g.key === to ? g.assignMany(units) : g))
    }
    return new AssignmentPlan({ groups, pool })
  }

  // 실외기 모델 교체. 계열이 바뀌어 방출된 실내기는 풀로 이동한다.
  replaceModel(key: string, newOutdoorUnit: OutdoorUnit): { plan: AssignmentPlan; ejected: IndoorUnit[] } {
    const g = this._requireGroup(key)
    const { group, ejected } = g.replaceModel(newOutdoorUnit)
    const groups = this._groups.map((x) => (x.key === key ? group : x))
    const pool = [...this._pool, ...ejected]
    return { plan: new AssignmentPlan({ groups, pool }), ejected }
  }

  // 그룹 분할: 실내기 절반을 같은 실외기 모델의 새 그룹으로 옮긴다.
  split(key: string, nextMeta: GroupMeta): AssignmentPlan {
    const g = this._requireGroup(key)
    const { group, newGroup } = g.split(nextMeta)
    const groups = [...this._groups.map((x) => (x.key === key ? group : x)), newGroup]
    return new AssignmentPlan({ groups, pool: this._pool })
  }

  // 빈 실외기 그룹 추가.
  addGroup({ meta, outdoorUnit }: { meta: GroupMeta; outdoorUnit: OutdoorUnit }): AssignmentPlan {
    const group = new OutdoorGroup({ key: meta.key, label: meta.label, outdoorUnit, indoorUnits: [] })
    return new AssignmentPlan({ groups: [...this._groups, group], pool: this._pool })
  }

  // 그룹 삭제. 연결된 실내기는 풀로 반환된다.
  removeGroup(key: string): { plan: AssignmentPlan; released: IndoorUnit[] } {
    const g = this._requireGroup(key)
    const released = g.indoorUnits
    const groups = this._groups.filter((x) => x.key !== key)
    const pool = [...this._pool, ...released]
    return { plan: new AssignmentPlan({ groups, pool }), released }
  }

  // ── 순수 조회 집계(상태 변경 없음). '총 실외기 단가'는 그룹 경계를 넘는 도메인 집계이므로 조율자에 둔다. ──

  // 실외기 단가 합. 단가 미보유 실외기는 unknownCount로 계상(조용한 부분합 함정 방지).
  // 서로 다른 단가 유형(소비자가/공급가)이 섞이면 Price.plus가 예외로 차단한다.
  totalOutdoorPrice(opts: { typeCode?: string; activeOnly?: boolean } = {}): { sum: Price; unknownCount: number } {
    const groups = opts.activeOnly ? this._groups.filter((g) => g.indoorUnits.length > 0) : this._groups
    let sum: Price | null = null
    let unknownCount = 0
    for (const g of groups) {
      const p = opts.typeCode ? g.outdoorUnit.priceOf(opts.typeCode) : g.outdoorUnit.defaultPrice
      if (!p) {
        unknownCount++
        continue
      }
      sum = sum ? sum.plus(p) : p
    }
    return { sum: sum ?? Price.zero(opts.typeCode ?? DEFAULT_PRICE_TYPE), unknownCount }
  }

  // 실외기 에너지등급 분포(등급 id → 대수)와 등급 미상 대수.
  // 순서형 척도라 산술평균 대신 분포로 노출한다(고효율 대수 등은 소비측에서 파생).
  gradeDistribution(opts: { activeOnly?: boolean } = {}): { byGrade: Map<number, number>; unknown: number } {
    const groups = opts.activeOnly ? this._groups.filter((g) => g.indoorUnits.length > 0) : this._groups
    const byGrade = new Map<number, number>()
    let unknown = 0
    for (const g of groups) {
      const grade = g.outdoorUnit.grade
      if (!grade) {
        unknown++
        continue
      }
      byGrade.set(grade.value, (byGrade.get(grade.value) ?? 0) + 1)
    }
    return { byGrade, unknown }
  }

  private _requireGroup(key: string): OutdoorGroup {
    const g = this.groupByKey(key)
    if (!g) throw new NotFoundError(`실외기 그룹을 찾을 수 없습니다: ${key}`)
    return g
  }
}

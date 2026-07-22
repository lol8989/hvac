// 실외기 조합 애그리거트 루트 (Generation Context).
// 실외기 1대 + 연결된 실내기들의 묶음. 그룹 내부 불변식을 강제한다:
//   ① 계열 일치(교차 계열 배정 금지)  ② 최대 연결 수 초과 금지  ③ 실내기 중복 금지
// 조합비 범위(실외기 comboRange, 기본 0.5~1.3)는 "경고"이지 배정 거부 사유가 아니다.
//
// 불변(immutable): 상태 변경 메서드는 원본을 바꾸지 않고 새 OutdoorGroup을 반환한다.
// 그룹 간 이동(다른 그룹/미배정 풀)은 여러 애그리거트에 걸친 트랜잭션이므로
// 애플리케이션 유즈케이스가 unassign/assign을 조율한다(도메인은 자기 불변식만 책임).

import { ComboRatio } from '../shared/ComboRatio'
import { AssignmentRejected } from './errors'
import type { AssignReason } from './errors'
import { roomIdsOf } from './IndoorUnit'
import type { IndoorUnit } from './IndoorUnit'
import type { OutdoorUnit } from './OutdoorUnit'

export const ASSIGN_REASON = {
  SERIES_MISMATCH: 'SERIES_MISMATCH', // 계열 불일치
  DUPLICATE: 'DUPLICATE', // 이미 배정된 실내기
  MAX_CONNECTIONS: 'MAX_CONNECTIONS', // 최대 연결 수 초과
} as const

export type CanAssignResult = { ok: true } | { ok: false; reason: AssignReason }

export interface GroupMeta {
  key: string
  label: string
}

export interface OutdoorGroupProps {
  key: string
  label: string
  outdoorUnit: OutdoorUnit
  indoorUnits?: IndoorUnit[]
}

export class OutdoorGroup {
  readonly key: string
  readonly label: string
  readonly outdoorUnit: OutdoorUnit
  private readonly _indoorUnits: IndoorUnit[]

  constructor({ key, label, outdoorUnit, indoorUnits = [] }: OutdoorGroupProps) {
    // 구조 불변식(생성 시점 강제): 계열 일치 + id 중복 금지.
    // maxConnections(최대 연결 수)는 "성장" 제약이므로 assign 시점에서만 검사한다.
    const seen = new Set<string>()
    for (const idu of indoorUnits) {
      if (!outdoorUnit.energySource.equals(idu.energySource)) {
        throw new Error(`계열 불일치 실내기로 그룹을 구성할 수 없습니다: ${idu.id} (${idu.energySource.code})`)
      }
      if (seen.has(idu.id)) {
        throw new Error(`중복 실내기로 그룹을 구성할 수 없습니다: ${idu.id}`)
      }
      seen.add(idu.id)
    }
    this.key = key
    this.label = label
    this.outdoorUnit = outdoorUnit
    this._indoorUnits = [...indoorUnits]
  }

  // 방어적 복사본 — 외부에서 내부 배열을 변경할 수 없다.
  get indoorUnits(): IndoorUnit[] {
    return [...this._indoorUnits]
  }

  // 연결된 실(등장 순서, 유일). 한 실에 2대가 붙어도 1개로 센다.
  get roomIds(): string[] {
    return roomIdsOf(this._indoorUnits)
  }

  // 배정 가능 여부와 불가 사유를 반환한다(부작용 없음).
  // maxConnections는 실이 아니라 실내기 '대수'를 센다(IndoorUnit 1개 = 1대).
  canAssign(indoor: IndoorUnit): CanAssignResult {
    return this.canAssignMany([indoor])
  }

  // 여러 대를 한 번에 배정할 수 있는지(실 단위 배정용). 전부 아니면 전무.
  canAssignMany(indoors: readonly IndoorUnit[]): CanAssignResult {
    if (indoors.length === 0) return { ok: true }
    const seen = new Set(this._indoorUnits.map((i) => i.id))
    for (const indoor of indoors) {
      if (!this.outdoorUnit.energySource.equals(indoor.energySource)) {
        return { ok: false, reason: ASSIGN_REASON.SERIES_MISMATCH }
      }
      if (seen.has(indoor.id)) {
        return { ok: false, reason: ASSIGN_REASON.DUPLICATE }
      }
      seen.add(indoor.id)
    }
    if (this._indoorUnits.length + indoors.length > this.outdoorUnit.maxConnections) {
      return { ok: false, reason: ASSIGN_REASON.MAX_CONNECTIONS }
    }
    return { ok: true }
  }

  // 실내기 배정. 불변식 위반 시 예외. 성공 시 새 그룹 반환.
  assign(indoor: IndoorUnit): OutdoorGroup {
    return this.assignMany([indoor])
  }

  // 실 단위 배정 — 한 실의 모든 대수를 함께 넣는다. 하나라도 못 넣으면 아무것도 넣지 않는다.
  assignMany(indoors: readonly IndoorUnit[]): OutdoorGroup {
    if (indoors.length === 0) return this
    const check = this.canAssignMany(indoors)
    if (!check.ok) {
      throw new AssignmentRejected(indoors[0].id, check.reason)
    }
    return this._with([...this._indoorUnits, ...indoors])
  }

  // 실내기 해제(유닛 id). 없는 id는 무해.
  unassign(id: string): OutdoorGroup {
    return this._with(this._indoorUnits.filter((i) => i.id !== id))
  }

  // 실 해제 — 그 실의 모든 대수를 함께 뗀다.
  unassignRoom(roomId: string): OutdoorGroup {
    return this._with(this._indoorUnits.filter((i) => i.roomId !== roomId))
  }

  // 조합비 = Σ(연결 실내기 냉방용량) / 실외기 용량.
  comboRatio(): ComboRatio {
    const total = this._indoorUnits.reduce((sum, i) => sum + i.cool.kw, 0)
    return new ComboRatio(total, this.outdoorUnit.capacity.kw)
  }

  // 조합비 기반 경고 코드 목록(배정을 막지는 않는다).
  // 판정 기준은 고정 상수가 아니라 실외기의 제품군별 허용범위(comboRange)다.
  warnings(): string[] {
    const judgement = this.comboRatio().judgeWith(this.outdoorUnit.comboRange)
    const w: string[] = []
    if (judgement === 'OVERLOADED') w.push('OVERLOADED')
    if (judgement === 'UNDERLOADED') w.push('UNDERLOADED')
    return w
  }

  // 실외기 모델 교체. 계열이 바뀌어 호환 안 되는 실내기는 방출 목록으로 돌려준다.
  replaceModel(newOutdoorUnit: OutdoorUnit): { group: OutdoorGroup; ejected: IndoorUnit[] } {
    const kept: IndoorUnit[] = []
    const ejected: IndoorUnit[] = []
    for (const idu of this._indoorUnits) {
      if (newOutdoorUnit.energySource.equals(idu.energySource)) kept.push(idu)
      else ejected.push(idu)
    }
    const group = new OutdoorGroup({ key: this.key, label: this.label, outdoorUnit: newOutdoorUnit, indoorUnits: kept })
    return { group, ejected }
  }

  // 그룹 분할: 실 절반을 같은 실외기 모델의 새 그룹으로 옮긴다.
  // 한 실의 여러 대수는 쪼개지 않는다 — 선정표의 실 행이 실외기 1대를 가리켜야 하기 때문이다.
  split(nextMeta: GroupMeta): { group: OutdoorGroup; newGroup: OutdoorGroup } {
    const rooms = this.roomIds
    if (rooms.length < 2) {
      throw new Error('연결된 실이 2곳 미만이면 분할할 수 없습니다')
    }
    const movedRooms = new Set(rooms.slice(Math.ceil(rooms.length / 2)))
    const kept = this._indoorUnits.filter((u) => !movedRooms.has(u.roomId))
    const moved = this._indoorUnits.filter((u) => movedRooms.has(u.roomId))
    const group = this._with(kept)
    const newGroup = new OutdoorGroup({
      key: nextMeta.key,
      label: nextMeta.label,
      outdoorUnit: this.outdoorUnit,
      indoorUnits: moved,
    })
    return { group, newGroup }
  }

  // 배치 동기화: 이 그룹이 배정하던 실들을 새 실내기 구성(desiredByRoom)에 맞춰
  // "유지 가능한 만큼만" 유지한 새 그룹을 만든다. 실 순서대로 빈 그룹에 재배정하며,
  // 계열이 바뀌었거나 대수 증가로 maxConnections를 넘기는 실·배치에서 사라진 실은 뺀다
  // (방출된 실은 호출자가 미배정 풀로 회수). 판정은 canAssignMany 하나로 — 규칙 재구현 금지.
  retainFrom(desiredByRoom: ReadonlyMap<string, readonly IndoorUnit[]>): OutdoorGroup {
    let g: OutdoorGroup = this._with([])
    for (const rid of this.roomIds) {
      const units = desiredByRoom.get(rid)
      if (!units || units.length === 0) continue // 배치에서 사라진 실
      if (g.canAssignMany(units).ok) g = g.assignMany(units)
    }
    return g
  }

  // 내부: 실내기 목록만 교체한 새 그룹 생성(메타·실외기 유지).
  private _with(indoorUnits: IndoorUnit[]): OutdoorGroup {
    return new OutdoorGroup({ key: this.key, label: this.label, outdoorUnit: this.outdoorUnit, indoorUnits })
  }
}

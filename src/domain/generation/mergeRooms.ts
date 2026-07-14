// 실 병합 (Generation 컨텍스트 · 순수 도메인 서비스).
//
// 붙어 있는 두 실을 하나로 합친다. 자르기(sliceRoom)의 역연산이다 —
// 형제(같은 실에서 잘려 나온 조각)를 다시 합치면 원래 실이 복원된다.
//
// 규칙(설계결정 실_병합_되돌리기_설계_v1 §4):
//  · 면적 = 두 실의 합 (면적 합 보존 — 자르기와 대칭)
//  · 형상 = 합집합(오목할 수 있다). 단변·장변은 그 형상의 OBB에서 새로 뽑는다
//  · 용도 = 면적이 큰 실을 승계. 단위부하가 다르면 **부하 합계가 바뀐다** — 그 사실을 숫자로 돌려준다
//  · 층 = 같아야 한다(실외기 버킷이 층 × 계열이다)

import { Room } from './Room'
import { Polygon, unionPolygons } from '../shared/Polygon'
import { DomainError } from './errors'

export class MergeFloorMismatchError extends DomainError {
  constructor(a: string, b: string) {
    super(`층이 다른 실은 합칠 수 없습니다 (${a} ≠ ${b})`)
    this.name = 'MergeFloorMismatchError'
  }
}

export interface RoomShapeRef {
  readonly room: Room
  readonly polygon: Polygon
}

export interface MergeResult extends RoomShapeRef {
  readonly usageChanged: boolean // 작은 실의 용도가 버려졌는가
  readonly loadDeltaW: number // 병합으로 달라진 냉방부하(W). 0이면 합이 보존됐다
}

export const mergeRooms = (a: RoomShapeRef, b: RoomShapeRef): MergeResult => {
  if (a.room.floor !== b.room.floor) throw new MergeFloorMismatchError(a.room.floor, b.room.floor)

  const polygon = unionPolygons(a.polygon, b.polygon) // 인접하지 않으면 NotAdjacentError
  const areaM2 = a.room.areaM2 + b.room.areaM2

  // 용도(와 부하강도·단위부하 오버라이드)는 면적이 큰 실에서 물려받는다.
  const dominant = a.room.areaM2 >= b.room.areaM2 ? a.room : b.room
  const other = dominant === a.room ? b.room : a.room

  const mPerUnit = Math.sqrt(areaM2 / polygon.area)
  const { shortSide, longSide } = polygon.obb()
  const { id, name } = identityOf(a.room, b.room)

  const base = Room.create({
    id,
    name,
    floor: a.room.floor,
    areaM2,
    usage: dominant.usage,
    facility: dominant.facility,
    shortSideM: shortSide * mPerUnit,
    longSideM: longSide * mPerUnit,
    intensity: dominant.intensity,
    aiUnitLoad: dominant.unitLoad.ai,
  })
  const room = dominant.unitLoad.user !== undefined ? base.overrideUnitLoad(dominant.unitLoad.user) : base

  const before = a.room.requiredLoadW.cool + b.room.requiredLoadW.cool
  return {
    room,
    polygon,
    usageChanged: dominant.usage !== other.usage,
    loadDeltaW: room.requiredLoadW.cool - before,
  }
}

// 형제(같은 부모에서 -1 / -2로 잘려 나온 조각)면 부모를 복원한다 — 자르기의 자연스러운 역연산.
// 아니면 앞선 실의 id를 쓰고 이름은 합성한다(선정표 행 순서를 지키기 위해 앞선 자리를 쓴다).
const identityOf = (a: Room, b: Room): { id: string; name: string } => {
  const sib = siblingParent(a.id, b.id)
  if (sib) return { id: sib, name: parentName(a.name, b.name) ?? `${a.name}+${b.name}` }
  return { id: a.id, name: `${a.name}+${b.name}` }
}

// 'AC_001-1' + 'AC_001-2' → 'AC_001'. 순서는 상관없다.
const siblingParent = (x: string, y: string): string | null => {
  const px = splitSuffix(x)
  const py = splitSuffix(y)
  if (!px || !py) return null
  if (px.base !== py.base) return null
  if (new Set([px.n, py.n]).size !== 2) return null // 같은 번호 두 개는 형제가 아니다
  return px.base
}

const splitSuffix = (id: string): { base: string; n: string } | null => {
  const at = id.lastIndexOf('-')
  if (at <= 0) return null
  const n = id.slice(at + 1)
  return /^[12]$/.test(n) ? { base: id.slice(0, at), n } : null
}

// '거실-1' + '거실-2' → '거실'
const parentName = (x: string, y: string): string | null => {
  const nx = splitSuffix(x)
  const ny = splitSuffix(y)
  if (!nx || !ny || nx.base !== ny.base) return null
  return nx.base
}

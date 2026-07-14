// 실 슬라이싱 (Generation 컨텍스트 · 순수 도메인 서비스).
//
// 실 하나를 직선으로 잘라 둘로 만든다. AI 검출이 하나로 잡은 실을 사람이 나누는 도구다.
//
// 면적 산정 규칙(설계결정 실_슬라이싱_설계_v1 §3.1):
//   목업 도면에는 전역 px→㎡ 축척이 없다(실마다 scale = √(area / 폴리곤넓이)를 따로 잡는다 — data.ts:32).
//   따라서 자식 면적은 기하에서 직접 뽑지 않고 부모 면적을 넓이 비율로 나눈다.
//   이 규칙은 면적 합 보존(area(A) + area(B) === area(부모))을 자동으로 만족한다.
//
// 단변·장변은 반드시 자식 폴리곤의 OBB에서 새로 뽑는다. Room.withArea는 치수를 그대로
// 물려주므로(Room.ts:107) 면적만 바꾸면 실내기 타입이 옛 형상 기준으로 나온다.

import { Room } from './Room'
import { Polygon, type CutLine } from '../shared/Polygon'
import { DomainError } from './errors'

// 조각이 부모의 이 비율보다 작으면 자르지 않는다.
export const MIN_SLICE_RATIO = 0.02

// 상대비만으로는 부족하다(적대적 QA 2026-07-14). 2%는 '부모 기준'이라 재귀 슬라이스가
// 매번 통과하면서 실을 무한히 작게 만들 수 있고, 넓이만 보므로 폭 2cm짜리 띠도 통과했다.
// 그런 조각은 실이 아니다 — 실내기를 놓을 수도, 선정표에 실을 수도 없다.
export const MIN_ROOM_AREA_M2 = 1.0 // 절대 면적 하한
export const MIN_ROOM_SHORT_SIDE_M = 0.5 // 단변 하한(사람이 들어갈 수 없는 폭은 실이 아니다)

// 절단선이 실을 가르지 않았다(밖을 지나거나 꼭짓점만 스쳤다).
export class SliceMissedRoomError extends DomainError {
  readonly roomId: string
  constructor(roomId: string) {
    super(`절단선이 실 ${roomId}을(를) 가르지 않습니다`)
    this.name = 'SliceMissedRoomError'
    this.roomId = roomId
  }
}

// 조각이 너무 얇거나 작아 실로 만들 수 없다.
export class TooThinSliceError extends DomainError {
  readonly roomId: string
  constructor(roomId: string, reason: string) {
    super(`조각이 실이 되기엔 너무 작습니다 — ${reason}`)
    this.name = 'TooThinSliceError'
    this.roomId = roomId
  }
}

export interface RoomSlice {
  readonly room: Room
  readonly polygon: Polygon
}

// 오목 실(병합으로 생긴 ㄴ자·ㄷ자)은 한 선이 3조각 이상을 만들 수 있다.
// 실 하나는 둘로만 나눈다 — 사용자가 각도나 위치를 바꾸면 된다.
export class SliceProducesManyPiecesError extends DomainError {
  readonly pieces: number
  constructor(roomId: string, pieces: number) {
    super(`이 선으로 자르면 실이 ${pieces}조각으로 나뉩니다 — 위치나 각도를 바꿔 보세요`)
    this.name = 'SliceProducesManyPiecesError'
    this.pieces = pieces
    void roomId
  }
}

export const sliceRoom = (parent: Room, polygon: Polygon, line: CutLine): [RoomSlice, RoomSlice] => {
  const pieces = polygon.splitByLine(line)
  if (pieces.length < 2) throw new SliceMissedRoomError(parent.id)
  if (pieces.length > 2) throw new SliceProducesManyPiecesError(parent.id, pieces.length)

  const whole = polygon.area
  // 부모의 축척(m/단위) — 자식도 같은 도면 위에 있으므로 그대로 물려받는다.
  const mPerUnit = Math.sqrt(parent.areaM2 / whole)

  // 실이 될 수 없는 조각은 만들지 않는다: 상대비 · 절대 면적 · 단변을 모두 본다.
  for (const piece of pieces) {
    const ratio = piece.area / whole
    if (ratio < MIN_SLICE_RATIO) throw new TooThinSliceError(parent.id, `부모의 ${(ratio * 100).toFixed(1)}% (최소 ${MIN_SLICE_RATIO * 100}%)`)
    const areaM2 = parent.areaM2 * ratio
    if (areaM2 < MIN_ROOM_AREA_M2) throw new TooThinSliceError(parent.id, `면적 ${areaM2.toFixed(2)}㎡ (최소 ${MIN_ROOM_AREA_M2}㎡)`)
    const shortM = piece.obb().shortSide * mPerUnit
    if (shortM < MIN_ROOM_SHORT_SIDE_M) throw new TooThinSliceError(parent.id, `폭 ${shortM.toFixed(2)}m (최소 ${MIN_ROOM_SHORT_SIDE_M}m)`)
  }

  const slices = pieces.map((piece, i) => childOf(parent, piece, i + 1, whole, mPerUnit))
  return [slices[0], slices[1]]
}

const childOf = (parent: Room, polygon: Polygon, n: number, wholeArea: number, mPerUnit: number): RoomSlice => {
  const { shortSide, longSide } = polygon.obb()
  const base = Room.create({
    id: `${parent.id}-${n}`,
    floor: parent.floor,
    name: `${parent.name}-${n}`,
    areaM2: parent.areaM2 * (polygon.area / wholeArea),
    usage: parent.usage,
    facility: parent.facility,
    shortSideM: shortSide * mPerUnit,
    longSideM: longSide * mPerUnit,
    intensity: parent.intensity,
    aiUnitLoad: parent.unitLoad.ai,
  })
  // 사용자가 부모의 단위부하를 손으로 고쳤다면 그 판단은 자식에도 유효하다
  // (withUsage/withIntensity가 오버라이드를 보존하는 기존 정책과 같은 결).
  const room = parent.unitLoad.user !== undefined ? base.overrideUnitLoad(parent.unitLoad.user) : base
  return { room, polygon }
}

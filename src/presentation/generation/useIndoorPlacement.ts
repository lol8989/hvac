// 실내기 배치(placements) 편집 커맨드 묶음 — AI 배치·심볼 이동/회전/삭제·추가·대수모델 수정/초기화 + 좌표 어댑터.
//
// 도면 심볼 1개 = 실내기 1대 = 선정표 대수 1 (Placement.positions.length === quantity 불변식).
// 대수의 SSOT는 도면 심볼이고, 이 훅의 커맨드가 그 심볼(placements)을 고친다.
//
// App.tsx에서 배치 편집 핸들러가 좌표계산(layoutFor)·도메인 규칙·예외표시와 엉켜 있던 것을(§5.8)
// 한 액터(실내기 배치 편집)로 모은다. 도메인 판단은 recalc/Placement에 있고, 여기는 오케스트레이션만 한다.
import { useMemo } from 'react'
import type { MutableRefObject } from 'react'
import type { Room } from '../../data'
import type { IndoorModelCatalog } from '../../application/generation/ports'
import type { IndoorModel } from '../../domain/generation/IndoorModel'
import type { Room as DomainRoom } from '../../domain/generation/Room'
import { indoorUnitId, type IndoorUnit } from '../../domain/generation/IndoorUnit'
import { Placement } from '../../domain/generation/Placement'
import { layoutPositions, type UnitPosition } from '../../domain/generation/layoutPositions'
import { Polygon } from '../../domain/shared/Polygon'
import { applyAiPlacement, aiSelectionFor } from '../../domain/generation/recalc'
import { DomainError } from '../../domain/generation/errors'
import { indoorUnitsFor } from './planAdapter'
import type { UnitSym } from '../../components/viewer/geometry'

type PlacementMap = Record<string, Placement>
type PlacementsUpdate = PlacementMap | ((prev: PlacementMap) => PlacementMap)
export type EditPlacements = (label: string, v: PlacementsUpdate) => void

export interface IndoorPlacementInput {
  // 실 형상을 도면(월드) 좌표로 스케일한 뷰 — 심볼 좌표 레이아웃의 기준.
  worldRooms: Record<string, Room>
  domainRooms: Record<string, DomainRoom>
  indoorCatalog: IndoorModelCatalog
  indoorModels: readonly IndoorModel[]
  placements: PlacementMap
  editPlacements: EditPlacements
  flash: (msg: string) => void
  // 재배치(aiPlace)는 새 시작이라 실외기 자동선정 억제를 해제한다(usePlanCommands와 공유하는 ref).
  suppressAutoSelectRef: MutableRefObject<boolean>
}

export interface IndoorPlacement {
  layoutFor: (roomId: string, count: number) => UnitPosition[]
  unitsFrom: (ps: PlacementMap) => IndoorUnit[]
  indoorSymbols: UnitSym[]
  aiPlace: () => void
  moveUnits: (moves: { id: string; x: number; y: number }[]) => void
  rotateUnits: (rots: { id: string; rot: number }[]) => void
  deleteUnits: (ids: string[]) => void
  addUnitToRoom: (roomId: string) => void
  overrideIndoor: (id: string, modelCode: string, quantity: number) => void
  resetIndoor: (id: string) => void
}

export function useIndoorPlacement(input: IndoorPlacementInput): IndoorPlacement {
  const { worldRooms, domainRooms, indoorCatalog, indoorModels, placements, editPlacements, flash, suppressAutoSelectRef } = input

  // 심볼 좌표(도면 좌표계)로 실 폴리곤을 판정할 때 쓴다.
  const worldPolyOf = (roomId: string): Polygon | null => {
    const pts = worldRooms[roomId]?.points
    return pts && pts.length >= 3 ? Polygon.of(pts) : null
  }

  // 실 안에 N대를 놓을 도면 좌표. 도메인(Placement)은 "대수만큼 좌표가 있어야 한다"만 알고,
  // 실이 도면 어디에 있는지는 이 어댑터가 안다.
  const layoutFor = (roomId: string, count: number): UnitPosition[] => {
    const poly = worldPolyOf(roomId)
    if (!poly) return []
    return layoutPositions(poly, count)
  }

  // 대수가 바뀔 때 좌표 맞추기: 이미 놓인 심볼의 자리는 지키고, 남는 건 자르고 모자라면 새로 깐다.
  const resizePositions = (prev: readonly UnitPosition[], roomId: string, n: number): UnitPosition[] => {
    if (prev.length === n) return [...prev]
    if (prev.length > n) return prev.slice(0, n)
    return [...prev, ...layoutFor(roomId, n).slice(prev.length)]
  }

  // 실내기 배치(placements) → 도메인 실내기 유닛 목록. 대수만큼 유닛이 생기고,
  // 용량은 실 설계부하가 아니라 선정된 모델의 정격이다(조합비·maxConnections의 기준).
  const unitsFrom = (ps: PlacementMap): IndoorUnit[] => {
    const out: IndoorUnit[] = []
    for (const [id, p] of Object.entries(ps)) {
      const room = domainRooms[id]
      const model = indoorCatalog.byCode(p.effectiveSelection.modelCode)
      if (!room || !model) continue
      out.push(...indoorUnitsFor({ id, name: room.name }, p.effectiveSelection.quantity, model))
    }
    return out
  }

  // 'AI 실내기 배치' = 모델·대수 선정 + 좌표 생성. 도면 심볼은 그 결과를 그린다(별도 명령 없음).
  const aiPlace = () => {
    // 방마다 필요부하 기반으로 모델+대수 자동 선정. 사용자 수정 셀·좌표는 보존(AI값만 갱신).
    // 플랜 동기화(미배정 풀 편입)는 placements 변경 이펙트가 맡는다. 배정은 이후 combine에서 생긴다.
    // 재배치는 새 시작이라 삭제 억제를 해제한다(다음 combine 진입 시 1회 자동 선정 복원).
    suppressAutoSelectRef.current = false
    editPlacements('AI 실내기 배치', applyAiPlacement(Object.values(domainRooms), placements, indoorModels, layoutFor))
    flash('✦ AI가 실 ' + Object.keys(domainRooms).length + '곳에 실내기를 배치·선정했습니다 (수정 셀은 보존)')
  }

  // ── 도면 심볼 = 실내기 대수 (SSOT) ──
  // placements의 좌표를 그대로 심볼로 편다. 심볼 id는 `${roomId}#${n}`(1-based).
  const indoorSymbols = useMemo<UnitSym[]>(
    () =>
      Object.entries(placements).flatMap(([roomId, p]) =>
        p.positions.map((pos, i) => ({ id: indoorUnitId(roomId, i + 1), roomId, x: pos.x, y: pos.y, rot: pos.rot })),
      ),
    [placements],
  )

  // 심볼 id → (실 id, 0-based 인덱스). 파싱 실패는 무시(방어).
  const parseUnitId = (id: string): { roomId: string; index: number } | null => {
    const at = id.lastIndexOf('#')
    if (at < 1) return null
    const n = Number(id.slice(at + 1))
    if (!Number.isInteger(n) || n < 1) return null
    return { roomId: id.slice(0, at), index: n - 1 }
  }

  // 심볼별 유닛 편집(이동·회전)의 공통 뼈대 — id를 실·인덱스로 풀어 해당 유닛에 apply를 건다.
  // 이동/회전은 apply·라벨만 다르고 순회·방어는 동일했다(near-identical 통합).
  const mutateUnits = <E extends { id: string }>(label: string, entries: E[], apply: (p: Placement, index: number, e: E) => Placement) =>
    editPlacements(label, (prev) => {
      const next = { ...prev }
      for (const e of entries) {
        const ref = parseUnitId(e.id)
        if (!ref || !next[ref.roomId]) continue
        next[ref.roomId] = apply(next[ref.roomId], ref.index, e)
      }
      return next
    })

  // 도면에서 심볼을 옮기면/돌리면 그 실내기의 좌표·회전이 바뀐다(대수·모델은 그대로).
  const moveUnits = (moves: { id: string; x: number; y: number }[]) =>
    mutateUnits('실내기 이동', moves, (p, i, m) => p.moveUnit(i, m.x, m.y))
  const rotateUnits = (rots: { id: string; rot: number }[]) =>
    mutateUnits('실내기 회전', rots, (p, i, r) => p.rotateUnit(i, r.rot))

  // 도면에서 심볼을 지우면 그 실의 대수가 줄고, 선정표·조합비가 즉시 따라온다.
  // 한 실의 여러 대수를 지울 때는 인덱스가 밀리지 않도록 큰 것부터 지운다.
  const deleteUnits = (ids: string[]) => {
    editPlacements('실내기 삭제', (prev) => {
      const next = { ...prev }
      const byRoom = new Map<string, number[]>()
      for (const id of ids) {
        const ref = parseUnitId(id)
        if (!ref || !next[ref.roomId]) continue
        byRoom.set(ref.roomId, [...(byRoom.get(ref.roomId) ?? []), ref.index])
      }
      for (const [roomId, indexes] of byRoom) {
        let p: Placement | null = next[roomId]
        for (const i of [...indexes].sort((a, b) => b - a)) {
          if (!p) break
          p = p.removeUnit(i)
        }
        if (p) next[roomId] = p
        else delete next[roomId] // 마지막 한 대를 지웠다 → 그 실에는 실내기가 없다
      }
      return next
    })
    flash(`실내기 ${ids.length}대를 삭제했습니다 (선정표 대수에 반영)`)
  }

  // 도면에서 실내기를 더하면 그 실의 대수가 는다. 모델은 그 실의 선정 모델을 따른다.
  // layoutFor는 실이 너무 얇으면 도메인 에러를 던진다 → 화면을 죽이지 않고 사유를 알린다.
  const addUnitToRoom = (roomId: string) => {
    const room = domainRooms[roomId]
    if (!room) return
    try {
      const existing = placements[roomId]
      const next = existing
        ? existing.addUnit(layoutFor(roomId, existing.quantity + 1)[existing.quantity] ?? { x: 0, y: 0, rot: 0 })
        : Placement.ai(roomId, { ...aiSelectionFor(room, indoorModels), quantity: 1 }, layoutFor(roomId, 1))
      editPlacements('실내기 추가', (prev) => ({ ...prev, [roomId]: next }))
      flash(`${roomId}에 실내기 1대를 추가했습니다`)
    } catch (e) {
      flash(e instanceof DomainError ? e.message : '실내기를 추가할 수 없습니다')
    }
  }

  // 선정표에서 모델·대수를 고치면 도면 심볼 개수도 함께 바뀐다(대수 SSOT = 심볼).
  const overrideIndoor = (id: string, modelCode: string, quantity: number) => {
    if (!domainRooms[id]) return
    if (!indoorCatalog.byCode(modelCode)) { flash('카탈로그에 없는 모델입니다'); return }
    try {
      const sel = { modelCode, quantity }
      const positions = resizePositions(placements[id]?.positions ?? [], id, quantity)
      const nextP = (placements[id] ?? Placement.ai(id, sel, positions)).overrideSelection(sel, positions)
      editPlacements('실내기 대수·모델 수정', (prev) => ({ ...prev, [id]: nextP }))
    } catch (e) {
      flash(e instanceof DomainError ? e.message : '대수를 바꿀 수 없습니다')
    }
  }
  const resetIndoor = (id: string) => {
    if (!domainRooms[id] || !placements[id]) return
    try {
      // 오버라이드 해제 + 최신 부하 기준 AI 추천으로 갱신. 좌표도 AI 대수에 맞춰 다시 깐다.
      const ai = aiSelectionFor(domainRooms[id], indoorModels)
      const positions = layoutFor(id, ai.quantity)
      const nextP = placements[id].clearOverride(positions).withAiSelection(ai, positions)
      editPlacements('실내기 초기화', (prev) => ({ ...prev, [id]: nextP }))
    } catch (e) {
      flash(e instanceof DomainError ? e.message : '초기화할 수 없습니다')
    }
  }

  return { layoutFor, unitsFrom, indoorSymbols, aiPlace, moveUnits, rotateUnits, deleteUnits, addUnitToRoom, overrideIndoor, resetIndoor }
}

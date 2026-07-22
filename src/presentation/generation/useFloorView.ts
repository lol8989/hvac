// 층 전환 뷰 — 뷰어는 한 번에 한 층만 보여준다(다층 도면이 나란히 배치되므로).
// 활성 층 기준으로 실·실내기·실외기·선택·그룹을 걸러 뷰어에 넘길 형태로 파생한다(SRP: 뷰어는 받은 것만 렌더).
// activeFloor는 뷰 상태다 — World(되돌리기 단위) 밖에 둔다. Ctrl+Z가 층 전환을 되돌리면 안 된다.
// 설계: doc/05_설계결정/층_전환_설계_v1.md
import { useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Room } from '../../data' // 뷰어 좌표계 실(형상 반영)
import type { Room as DomainRoom } from '../../domain/generation/Room' // 층·부하 등 도메인 실
import type { Polygon } from '../../domain/shared/Polygon'
import type { UnitSym } from '../../components/viewer/geometry'
import { floorsOf, type FloorInfo } from './floors'

// 파생에 필요한 최소 그룹 형태(구조적) — planAdapter GroupView가 그대로 들어맞는다.
interface FloorGroup {
  key: string
  label: string
  model: string
  items: readonly string[] // 연결된 실 id
}

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

export interface FloorViewInput {
  domainRooms: Record<string, DomainRoom> // 실별 층(.floor)로 활성 실을 가른다
  roomGeom: Record<string, Polygon> // 실 형상 SSOT
  worldRooms: Record<string, Room> // 뷰어 좌표계 실(형상 반영)
  indoorSymbols: readonly UnitSym[]
  outdoorSymbols: readonly UnitSym[]
  activeGroups: readonly FloorGroup[]
  selRooms: readonly string[]
  hpByModel: ReadonlyMap<string, number>
}

export interface FloorView {
  floors: FloorInfo[]
  floorNames: string[]
  activeFloor: string
  setActiveFloor: Dispatch<SetStateAction<string>>
  activeRoomIds: Set<string>
  floorRooms: Record<string, Room>
  floorIndoorSymbols: UnitSym[]
  floorOutdoorSymbols: UnitSym[]
  floorSelectedIds: string[]
  floorOutdoorGroups: { key: string; label: string; model: string; hp: number | undefined }[]
  fitBounds: ViewBox | undefined
}

export function useFloorView(input: FloorViewInput): FloorView {
  const { domainRooms, roomGeom, worldRooms, indoorSymbols, outdoorSymbols, activeGroups, selRooms, hpByModel } = input

  const floors = useMemo(() => floorsOf(domainRooms, roomGeom), [domainRooms, roomGeom])
  const [activeFloor, setActiveFloor] = useState('')
  // 검출·자르기로 층 목록이 바뀌면 활성 층을 유효하게 유지(사라졌으면 첫 층으로).
  useEffect(() => {
    if (floors.length && !floors.some((f) => f.floor === activeFloor)) setActiveFloor(floors[0].floor)
  }, [floors, activeFloor])

  const activeRoomIds = useMemo(
    () => new Set(Object.keys(domainRooms).filter((id) => domainRooms[id].floor === activeFloor)),
    [domainRooms, activeFloor],
  )

  const floorRooms = useMemo(
    () => Object.fromEntries(Object.entries(worldRooms).filter(([id]) => activeRoomIds.has(id))),
    [worldRooms, activeRoomIds],
  )
  const floorIndoorSymbols = useMemo(
    () => indoorSymbols.filter((s) => s.roomId != null && activeRoomIds.has(s.roomId)),
    [indoorSymbols, activeRoomIds],
  )
  // 실외기 그룹의 층 = 연결된 실의 층(버킷 = 층×계열이라 한 그룹은 한 층). 그 그룹 심볼만 남긴다.
  const activeFloorGroupKeys = useMemo(
    () => new Set(activeGroups.filter((g) => g.items.some((rid) => activeRoomIds.has(rid))).map((g) => g.key)),
    [activeGroups, activeRoomIds],
  )
  const floorOutdoorSymbols = useMemo(
    () => outdoorSymbols.filter((s) => activeFloorGroupKeys.has(s.id)),
    [outdoorSymbols, activeFloorGroupKeys],
  )
  const floorSelectedIds = useMemo(() => selRooms.filter((id) => activeRoomIds.has(id)), [selRooms, activeRoomIds])
  const floorOutdoorGroups = useMemo(
    () =>
      activeGroups
        .filter((g) => activeFloorGroupKeys.has(g.key))
        .map((g) => ({ key: g.key, label: g.label, model: g.model, hp: hpByModel.get(g.model) })),
    [activeGroups, activeFloorGroupKeys, hpByModel],
  )
  // 활성 층 실들의 bbox(뷰어 좌표계) — 뷰어가 이 범위에 맞춘다.
  const fitBounds = useMemo<ViewBox | undefined>(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const id of activeRoomIds) {
      for (const p of floorRooms[id]?.points ?? []) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
    }
    return minX === Infinity ? undefined : { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }, [floorRooms, activeRoomIds])

  const floorNames = useMemo(() => floors.map((f) => f.floor), [floors])

  return {
    floors,
    floorNames,
    activeFloor,
    setActiveFloor,
    activeRoomIds,
    floorRooms,
    floorIndoorSymbols,
    floorOutdoorSymbols,
    floorSelectedIds,
    floorOutdoorGroups,
    fitBounds,
  }
}

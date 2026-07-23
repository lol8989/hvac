// 실내기 심볼이 자기 실 안에 있는가 — 순수 도메인 규칙.
//
// **도면 심볼 1개 = 실내기 1대 = 선정표 대수 1**(CLAUDE.md §9)이고, 그 좌표가 산출 도면에 실린다.
// 그런데 심볼을 실 밖으로 끌어내도 소속(roomId)은 바뀌지 않는다 — 대수는 그 실에 그대로 남는다.
// 그러면 **선정표는 '거실 1대'라 말하는데 도면에는 거실 밖에 찍힌다**. 표와 도면이 어긋난다.
//
// 남의 실 위에 놓인 경우도 같은 위반이다. 화면 하이라이팅은 '놓인 실'을 따라가지만
// (roomIdsForUnits) 소속은 그대로라, 사용자가 옮겼다고 믿는 것과 표가 세는 것이 다르다.
// 여기서는 **판정만** 한다 — 옮길지 되돌릴지는 정책이고, 표현 계층이 사용자에게 묻는다.
import type { Polygon } from '../shared/Polygon'

export interface UnitAt {
  roomId: string // 소속 실(심볼 id가 말하는 실)
  index: number // 그 실에서 몇 번째 대수인지(0-based)
  x: number
  y: number
}

export interface MisplacedUnit {
  roomId: string
  index: number
  roomName: string
  // 심볼이 실제로 놓인 실. 어느 실도 아니면 null.
  landedIn: { roomId: string; roomName: string } | null
}

export interface MisplacedInput {
  units: readonly UnitAt[]
  shapes: Readonly<Record<string, Polygon>> // 실 id → 도면 좌표 형상
  names: Readonly<Record<string, string>> // 실 id → 실명(안내용)
}

export const findMisplacedUnits = (input: MisplacedInput): MisplacedUnit[] => {
  const { units, shapes, names } = input
  const nameOf = (id: string): string => names[id] ?? id
  const out: MisplacedUnit[] = []
  for (const u of units) {
    const own = shapes[u.roomId]
    if (!own) continue // 형상을 모르는 실(자르기·재시딩 중)은 판정하지 않는다
    if (own.contains({ x: u.x, y: u.y })) continue
    const landedId = Object.keys(shapes).find((id) => id !== u.roomId && shapes[id].contains({ x: u.x, y: u.y }))
    out.push({
      roomId: u.roomId,
      index: u.index,
      roomName: nameOf(u.roomId),
      landedIn: landedId ? { roomId: landedId, roomName: nameOf(landedId) } : null,
    })
  }
  return out
}

// 안내 문구(가드·토스트 공용). "거실 2번째 대수 → 침실 위" 처럼 무엇이 어디로 갔는지 말한다.
export const describeMisplaced = (m: MisplacedUnit): string =>
  m.landedIn
    ? `${m.roomName} ${m.index + 1}번째 대수가 ${m.landedIn.roomName} 위에 있습니다`
    : `${m.roomName} ${m.index + 1}번째 대수가 실 밖에 있습니다`

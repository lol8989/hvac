// 뷰어 편집용 지오메트리 상수·헬퍼·타입 (presentation 전용, 도메인 무관).

export const GRID = 20
export const ROT_STEP = 15 // 회전 핸들 스텝(도)
export const ROT_SENS = 0.8 // 회전 드래그 감도

export const snap = (v: number): number => Math.round(v / GRID) * GRID
export const norm = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360

// 심볼: 좌표 + 회전.
// 실내기 심볼은 실내기 한 대다 — id = `${roomId}#${n}`, roomId = 설치된 실.
// 실외기 심볼은 그룹 하나다 — id = 그룹 key, roomId 없음.
// kind는 표시용 유형 태그(4WAY 등)로, 실내기는 배정 모델의 유형이 우선한다.
export interface UnitSym {
  id: string
  roomId?: string
  x: number
  y: number
  rot: number
  kind?: string
}

// 실(존): 이름 + 사각형 bounds (모서리 리사이즈 가능).
export interface ZoneBox {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

// 존 사각형의 면적(㎡). mmPerUnit(정규화 1단위=실 mm)이 있으면 기하로 계산해 리사이즈를 반영하고,
// 없으면(목업 좌표계는 실 치수가 아님) 설계 면적 폴백을 쓴다. 둘 다 없으면 null.
export const zoneAreaM2 = (z: { w: number; h: number }, mmPerUnit?: number, fallback?: number): number | null => {
  if (mmPerUnit) return (z.w * mmPerUnit * (z.h * mmPerUnit)) / 1e6
  return fallback ?? null
}

// AABB 교차 여부(마퀴 히트 테스트용).
export const rectsIntersect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y)

// 점이 존(사각형) 내부에 있는지(경계 포함).
export const pointInZone = (px: number, py: number, z: ZoneBox): boolean =>
  px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h

// 점을 포함하는 첫 번째 존(위 레이어 우선). 없으면 null.
export const zoneOfPoint = (px: number, py: number, zones: ZoneBox[]): ZoneBox | null =>
  zones.find((z) => pointInZone(px, py, z)) ?? null

// 선택된 실내기 심볼 → 담당 실 id 집합(중복 제거). 위치 우선:
// 심볼이 놓인 존을 반환해 다른 실로 드래그하면 하이라이팅이 따라간다.
// 어느 존 밖이면 심볼이 소속된 실(roomId)로 폴백한다.
// C(에어컨) 모드에서 선택된 심볼을 패널의 실 선택으로 올리는 데 사용.
export const roomIdsForUnits = (syms: UnitSym[], zones: ZoneBox[]): string[] => {
  const ids = new Set<string>()
  for (const s of syms) {
    const z = zoneOfPoint(s.x, s.y, zones)
    if (z) ids.add(z.id)
    else if (s.roomId) ids.add(s.roomId)
  }
  return Array.from(ids)
}

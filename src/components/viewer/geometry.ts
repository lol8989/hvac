// 뷰어 편집용 지오메트리 상수·헬퍼·타입 (presentation 전용, 도메인 무관).

export const GRID = 20
export const ROT_STEP = 15 // 회전 핸들 스텝(도)
export const ROT_SENS = 0.8 // 회전 드래그 감도

export const snap = (v: number): number => Math.round(v / GRID) * GRID
export const norm = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360

// 실내기(에어컨) 심볼: 좌표 + 회전.
export interface UnitSym {
  id: string
  x: number
  y: number
  rot: number
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

// AABB 교차 여부(마퀴 히트 테스트용).
export const rectsIntersect = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean =>
  !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y)

// 점이 존(사각형) 내부에 있는지(경계 포함).
export const pointInZone = (px: number, py: number, z: ZoneBox): boolean =>
  px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h

// 점을 포함하는 첫 번째 존(위 레이어 우선). 없으면 null.
export const zoneOfPoint = (px: number, py: number, zones: ZoneBox[]): ZoneBox | null =>
  zones.find((z) => pointInZone(px, py, z)) ?? null

// 선택된 실내기 심볼 → 담당 실 id 집합(중복 제거).
// 심볼 식별자가 실 id와 같으면 그대로 사용(정체성: 실내기 = 그 실의 장비),
// 식별자가 실과 무관한 자유 추가 심볼만 위치로 역참조. 어느 실에도 없으면 무시.
// C(에어컨) 모드에서 선택된 심볼을 패널의 실 선택으로 올리는 데 사용.
export const roomIdsForUnits = (syms: UnitSym[], zones: ZoneBox[]): string[] => {
  const zoneIds = new Set(zones.map((z) => z.id))
  const ids = new Set<string>()
  for (const s of syms) {
    if (zoneIds.has(s.id)) {
      ids.add(s.id)
    } else {
      const z = zoneOfPoint(s.x, s.y, zones)
      if (z) ids.add(z.id)
    }
  }
  return Array.from(ids)
}

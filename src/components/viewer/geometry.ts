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

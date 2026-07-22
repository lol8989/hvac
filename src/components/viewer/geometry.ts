// 뷰어 편집용 지오메트리 상수·헬퍼·타입 (presentation 전용).
// 형상 계산 자체는 도메인 값객체(Polygon)에 있다 — 뷰어와 산출물이 같은 면적을 말해야 한다.

import { Polygon } from '../../domain/shared/Polygon'
import type { Pt } from '../../domain/shared/Polygon'

export type { Pt }

export const GRID = 20
export const ROT_STEP = 15 // 회전 핸들 스텝(도) · 자르기 라인 회전 스텝
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

// 실(존): 이름 + 폴리곤. 축정렬 사각형은 정점 4개짜리 특수 케이스일 뿐이다 —
// 실을 사선으로 자르면(V 도구) 조각은 사각형이 아니다.
export interface ZoneBox {
  id: string
  name: string
  points: readonly Pt[]
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br'

export const rectPoints = (x: number, y: number, w: number, h: number): Pt[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
]

export const zoneBounds = (z: ZoneBox): { x: number; y: number; w: number; h: number } => {
  const xs = z.points.map((p) => p.x)
  const ys = z.points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

// 축정렬 사각형인가 — 모서리 리사이즈는 사각형 실에만 있다(잘린 실은 정점이 4개가 아니거나 사선이다).
export const isRectZone = (z: ZoneBox): boolean => {
  if (z.points.length !== 4) return false
  const b = zoneBounds(z)
  return z.points.every((p) => (p.x === b.x || p.x === b.x + b.w) && (p.y === b.y || p.y === b.y + b.h))
}

const poly = (z: ZoneBox): Polygon => Polygon.of(z.points)

export const zoneCentroid = (z: ZoneBox): Pt => poly(z).centroid

// 존의 면적(㎡)은 **도메인 Room이 말하는 값**이다.
//
// 예전에는 mmPerUnit(DXF 실좌표 축척)으로 폴리곤 넓이를 환산했는데, 실 폴리곤은 실도면 위에
// 얹힌 목업 좌표라 두 좌표계가 섞였다 — 도면 라벨이 622㎡, 선정표가 31.9㎡를 말했다(적대적 QA).
// 면적은 부하 → 대수 → 조합비의 상류값이다. 화면과 산출물이 다른 숫자를 말하면 안 된다.
// (도면에서 실을 리사이즈하면 App이 Room.withShape로 면적을 갱신하고, 그 값이 여기로 내려온다.)
export const zoneAreaM2 = (roomArea?: number): number | null => roomArea ?? null

const segsCross = (a: Pt, b: Pt, c: Pt, d: Pt): boolean => {
  const cr = (p: Pt, q: Pt, r: Pt): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = cr(c, d, a)
  const d2 = cr(c, d, b)
  const d3 = cr(a, b, c)
  const d4 = cr(a, b, d)
  return ((d1 > 0) !== (d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0) !== (d4 > 0) || d3 === 0 || d4 === 0)
}

// 마퀴(사각형)와 존(폴리곤)이 겹치는가.
export const zoneHitsRect = (rect: { x: number; y: number; w: number; h: number }, z: ZoneBox): boolean => {
  const p = poly(z)
  const corners = rectPoints(rect.x, rect.y, rect.w, rect.h)
  if (z.points.some((v) => v.x >= rect.x && v.x <= rect.x + rect.w && v.y >= rect.y && v.y <= rect.y + rect.h)) return true
  if (corners.some((c) => p.contains(c))) return true
  for (let i = 0; i < z.points.length; i++) {
    const a = z.points[i]
    const b = z.points[(i + 1) % z.points.length]
    for (let j = 0; j < 4; j++) {
      if (segsCross(a, b, corners[j], corners[(j + 1) % 4])) return true
    }
  }
  return false
}

// 점이 존 내부에 있는지(경계 포함).
export const pointInZone = (px: number, py: number, z: ZoneBox): boolean => poly(z).contains({ x: px, y: py })

// 점을 포함하는 첫 번째 존(위 레이어 우선). 없으면 null.
export const zoneOfPoint = (px: number, py: number, zones: readonly ZoneBox[]): ZoneBox | null =>
  zones.find((z) => pointInZone(px, py, z)) ?? null

// 사각형(x,y,w,h) 안에 중심이 든 심볼의 id 목록 — 마퀴(영역) 선택.
export const unitsInRect = (symbols: readonly UnitSym[], rect: { x: number; y: number; w: number; h: number }): string[] =>
  symbols
    .filter((u) => u.x >= rect.x && u.x <= rect.x + rect.w && u.y >= rect.y && u.y <= rect.y + rect.h)
    .map((u) => u.id)

// 존 여러 개를 감싸는 바운딩박스. 비면 null. (선택 실 위에 뜨는 오버레이 버튼 위치 등)
export const zonesBounds = (zones: readonly ZoneBox[]): { x: number; y: number; w: number; h: number } | null => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const z of zones) for (const p of z.points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  if (!Number.isFinite(minX)) return null // 존이 없거나 정점이 없다
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// 존 모서리 드래그로 사각형을 다시 그린다. 고정 모서리(anchor)를 붙박고 반대편을 포인터로 끈다.
// 최소 크기(min)로 클램프해 뒤집히거나 0이 되지 않게 한다. p는 이미 스냅된 좌표.
export const resizeRectFromCorner = (
  corner: Corner,
  anchor: Pt,
  p: Pt,
  min: number,
): { x: number; y: number; w: number; h: number } => {
  const ax = anchor.x, ay = anchor.y
  let px = p.x, py = p.y
  if (corner === 'br') { px = Math.max(px, ax + min); py = Math.max(py, ay + min); return { x: ax, y: ay, w: px - ax, h: py - ay } }
  if (corner === 'tl') { px = Math.min(px, ax - min); py = Math.min(py, ay - min); return { x: px, y: py, w: ax - px, h: ay - py } }
  if (corner === 'tr') { px = Math.max(px, ax + min); py = Math.min(py, ay - min); return { x: ax, y: py, w: px - ax, h: ay - py } }
  px = Math.min(px, ax - min); py = Math.max(py, ay + min); return { x: px, y: ay, w: ax - px, h: py - ay } // bl
}

// 선택된 실내기 심볼 → 담당 실 id 집합(중복 제거). 위치 우선:
// 심볼이 놓인 존을 반환해 다른 실로 드래그하면 하이라이팅이 따라간다.
// 어느 존 밖이면 심볼이 소속된 실(roomId)로 폴백한다.
// C(에어컨) 모드에서 선택된 심볼을 패널의 실 선택으로 올리는 데 사용.
export const roomIdsForUnits = (syms: UnitSym[], zones: readonly ZoneBox[]): string[] => {
  const ids = new Set<string>()
  for (const s of syms) {
    const z = zoneOfPoint(s.x, s.y, zones)
    if (z) ids.add(z.id)
    else if (s.roomId) ids.add(s.roomId)
  }
  return Array.from(ids)
}

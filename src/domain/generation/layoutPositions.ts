// 실내기 좌표 배치 규칙 (Generation 컨텍스트 · 순수 도메인 서비스).
//
// 실 안에 N대를 놓을 때 어디에 놓는가. 확산범위가 겹치지 않도록 균등 분산한다
// (근거: doc/05_설계결정/실내기_자동배치_룰.md §3 — 대수는 부하와 확산범위 중 큰 쪽이 정한다).
//
// 좌표계는 도면(뷰어) 좌표다. 이 좌표는 산출 도면에 그대로 실린다.
// 실은 사각형이 아닐 수 있다(슬라이싱) → 좌표는 반드시 폴리곤 **내부**여야 한다.
// 벽 밖에 찍히면 zoneOfPoint가 그 심볼을 옆 실 소속으로 오분류한다(위치가 소속을 이긴다).

import type { Polygon, Pt } from '../shared/Polygon'
import { DomainError } from './errors'

export interface UnitPosition {
  x: number
  y: number
  rot: number // 도(0~359)
}

const MAX_SAMPLES = 40000 // 표본 상한(성능 가드)

// 실 폴리곤과 대수로 좌표를 만든다. 셀이 최대한 정사각형이 되도록 열 수를 고른 뒤
// 격자 중심에 하나씩 놓는다. 사각형 실이면 격자 중심이 모두 내부라 예전 규칙과 같은 결과가 나온다.
export const layoutPositions = (shape: Polygon, count: number): UnitPosition[] => {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('count는 0 이상의 정수여야 합니다')
  }
  if (count === 0) return []

  const box = shape.bbox
  if (!(box.w > 0) || !(box.h > 0)) {
    throw new Error('실의 폭·높이는 0보다 커야 합니다')
  }

  // 1차: 대수만큼의 격자. 사각형이면 여기서 끝난다(전부 내부).
  const first = gridCenters(box, count).filter((p) => shape.contains(p))
  if (first.length >= count) return first.slice(0, count).map(toPosition)

  // 2차: 잘린 실이라 셀 일부가 벽 밖이다 → 촘촘한 격자에서 내부점을 모아 고르게 뽑는다.
  //
  // 간격은 bbox가 아니라 **폴리곤 넓이**로 잡는다(적대적 QA 2026-07-14).
  // bbox를 count만큼 쪼개는 방식은 얇고 긴 실(bbox의 1%만 차지)에서 내부점을 못 찾아
  // "자리가 실제로 있는데" 실패했다 — rejection sampling이 진 것이지 기하가 막은 게 아니다.
  let spacing = Math.sqrt(shape.area / count) / 2
  while (spacing > 0) {
    const cols = Math.ceil(box.w / spacing) + 1
    const rows = Math.ceil(box.h / spacing) + 1
    if (cols * rows > MAX_SAMPLES) break
    const inside = sampleInside(shape, box, cols, rows)
    if (inside.length >= count) return spread(inside, count, shape.centroid).map(toPosition)
    spacing /= 2
  }

  // 마지막 수단: OBB 장축 중심선을 따라 놓는다(얇은 띠는 이 선이 실 안을 지난다).
  const line = centerLinePoints(shape, count)
  if (line.length >= count) return line.slice(0, count).map(toPosition)

  throw new RoomTooThinForUnitsError(count)
}

// 도메인 에러다 — 상위(App)가 사유를 알고 사용자에게 옮길 수 있어야 한다.
// (예전엔 raw Error라 아무도 못 잡았고, React 렌더 단계에서 다시 던져져 화면이 통째로 죽었다.)
export class RoomTooThinForUnitsError extends DomainError {
  readonly count: number
  constructor(count: number) {
    super(`실이 너무 얇아 실내기 ${count}대를 놓을 자리가 없습니다`)
    this.name = 'RoomTooThinForUnitsError'
    this.count = count
  }
}

const toPosition = (p: Pt): UnitPosition => ({ x: p.x, y: p.y, rot: 0 })

// bbox 위 격자에서 폴리곤 내부 점만 모은다(읽기 순서: 위→아래, 좌→우).
const sampleInside = (shape: Polygon, box: { x: number; y: number; w: number; h: number }, cols: number, rows: number): Pt[] => {
  const out: Pt[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = {
        x: box.x + (box.w * (c + 0.5)) / cols,
        y: box.y + (box.h * (r + 0.5)) / rows,
      }
      if (shape.contains(p)) out.push(p)
    }
  }
  return out
}

// 폴리곤의 최소면적 외접사각형 장축을 따라 놓는 점들(내부인 것만).
// 아주 얇은 띠는 격자 표본이 성글어도 이 선 위에는 반드시 자리가 있다.
const centerLinePoints = (shape: Polygon, count: number): Pt[] => {
  const c = shape.centroid
  const { angleDeg } = longAxis(shape)
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const box = shape.bbox
  const span = Math.hypot(box.w, box.h)
  const out: Pt[] = []
  const N = count * 40 // 촘촘히 훑어 내부 구간만 남긴다
  for (let i = 0; i <= N; i++) {
    const t = -span / 2 + (span * i) / N
    const p = { x: c.x + dx * t, y: c.y + dy * t }
    if (shape.contains(p)) out.push(p)
  }
  return out.length >= count ? spread(out, count, c) : out
}

// 최소면적 외접사각형의 장축 방향(도).
const longAxis = (shape: Polygon): { angleDeg: number } => {
  const pts = shape.points
  let best = { angleDeg: 0, len: -1 }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > best.len) best = { angleDeg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI, len }
  }
  return { angleDeg: best.angleDeg }
}

// bbox를 count개 셀로 나눈 중심점들. 셀 종횡비가 1에 가깝도록 cols ≈ √(count × w/h).
const gridCenters = (box: { x: number; y: number; w: number; h: number }, count: number): Pt[] => {
  const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * box.w) / box.h))))
  const rows = Math.ceil(count / cols)
  const out: Pt[] = []
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    out.push({
      x: box.x + (box.w * (c + 0.5)) / cols,
      y: box.y + (box.h * (r + 0.5)) / rows,
    })
  }
  return out
}

// 후보점 중 count개를 고르게 고른다 — 중심에서 가장 가까운 점부터 시작해 가장 먼 점을 차례로 집는다
// (farthest-point sampling). 결정적이다: 같은 입력이면 같은 좌표가 나온다.
const spread = (candidates: Pt[], count: number, center: Pt): Pt[] => {
  const dist2 = (a: Pt, b: Pt): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
  const rest = [...candidates]
  const seedIdx = rest.reduce((best, p, i) => (dist2(p, center) < dist2(rest[best], center) ? i : best), 0)
  const picked: Pt[] = [rest.splice(seedIdx, 1)[0]]

  while (picked.length < count && rest.length > 0) {
    let bestIdx = 0
    let bestD = -1
    for (let i = 0; i < rest.length; i++) {
      const d = Math.min(...picked.map((q) => dist2(rest[i], q)))
      if (d > bestD) {
        bestD = d
        bestIdx = i
      }
    }
    picked.push(rest.splice(bestIdx, 1)[0])
  }
  // 읽기 순서(위→아래, 좌→우)로 정렬해 결과가 사람 눈에 자연스럽게 보이도록.
  return picked.sort((a, b) => a.y - b.y || a.x - b.x)
}

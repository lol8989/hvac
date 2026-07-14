// Polygon (Shared Kernel · Value Object).
//
// 실(Room)의 형상. 축정렬 사각형은 정점 4개짜리 특수 케이스일 뿐이다 —
// 실을 사선으로 자르면 조각은 사각형이 아니고, 그 형상이 면적·단변·장변을 정한다.
//
// 단위를 모른다. 넓이는 '폴리곤 넓이'(px²든 mm²든)이고, ㎡ 환산은 호출부(sliceRoom)가
// 부모 실의 축척으로 한다. 도메인이 SVG 픽셀을 알 필요는 없다.

export interface Pt {
  readonly x: number
  readonly y: number
}

// 절단선: 지나는 점 + 방향(도). 무한 직선이다(선분이 아니다).
export interface CutLine {
  readonly x: number
  readonly y: number
  readonly angleDeg: number
}

const EPS = 1e-9

const assertFinite = (p: Pt): void => {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new Error('폴리곤 좌표는 유한수여야 합니다')
  }
}

// 부호 있는 넓이 ×2 (반시계 양수). 넓이·볼록 판정의 토대.
const signedArea2 = (pts: readonly Pt[]): number => {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    s += a.x * b.y - b.x * a.y
  }
  return s
}

const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

export class Polygon {
  readonly points: readonly Pt[]

  private constructor(points: readonly Pt[]) {
    this.points = Object.freeze(points.map((p) => Object.freeze({ x: p.x, y: p.y })))
    Object.freeze(this)
  }

  static of(points: readonly Pt[]): Polygon {
    if (!Array.isArray(points) || points.length < 3) {
      throw new Error('폴리곤은 점이 3개 이상이어야 합니다')
    }
    points.forEach(assertFinite)
    if (Math.abs(signedArea2(points)) < EPS) {
      throw new Error('폴리곤의 넓이는 0보다 커야 합니다')
    }
    return new Polygon(points)
  }

  // 축정렬 사각형 — 반시계(SVG 좌표계에서는 시계) 순서.
  static rect(x: number, y: number, w: number, h: number): Polygon {
    return Polygon.of([
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ])
  }

  get area(): number {
    return Math.abs(signedArea2(this.points)) / 2
  }

  get centroid(): Pt {
    const a2 = signedArea2(this.points)
    let cx = 0
    let cy = 0
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i]
      const q = this.points[(i + 1) % this.points.length]
      const f = p.x * q.y - q.x * p.y
      cx += (p.x + q.x) * f
      cy += (p.y + q.y) * f
    }
    return { x: cx / (3 * a2), y: cy / (3 * a2) }
  }

  get bbox(): { x: number; y: number; w: number; h: number } {
    const xs = this.points.map((p) => p.x)
    const ys = this.points.map((p) => p.y)
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
  }

  // 점 포함(경계 포함). 오목 폴리곤에서도 옳도록 ray casting을 쓴다.
  contains(p: Pt): boolean {
    const pts = this.points
    for (let i = 0; i < pts.length; i++) {
      if (onSegment(pts[i], pts[(i + 1) % pts.length], p)) return true // 경계 = 포함
    }
    let inside = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i]
      const b = pts[j]
      const hit = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
      if (hit) inside = !inside
    }
    return inside
  }

  get isConvex(): boolean {
    const pts = this.points
    let sign = 0
    for (let i = 0; i < pts.length; i++) {
      const c = cross(pts[i], pts[(i + 1) % pts.length], pts[(i + 2) % pts.length])
      if (Math.abs(c) < EPS) continue
      const s = Math.sign(c)
      if (sign === 0) sign = s
      else if (s !== sign) return false
    }
    return true
  }

  // 최소면적 회전 바운딩박스의 두 변(단변·장변).
  // 축정렬 bbox를 쓰면 기울어진 실의 폭이 과대평가되고, 그 폭이 실내기 타입(4WAY/2WAY)을 가른다.
  obb(): { shortSide: number; longSide: number } {
    const hull = convexHull(this.points)
    let best: { shortSide: number; longSide: number } | null = null
    let bestArea = Infinity
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]
      const b = hull[(i + 1) % hull.length]
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < EPS) continue
      const ux = (b.x - a.x) / len
      const uy = (b.y - a.y) / len
      let minU = Infinity
      let maxU = -Infinity
      let minV = Infinity
      let maxV = -Infinity
      for (const p of hull) {
        const u = p.x * ux + p.y * uy
        const v = -p.x * uy + p.y * ux
        minU = Math.min(minU, u)
        maxU = Math.max(maxU, u)
        minV = Math.min(minV, v)
        maxV = Math.max(maxV, v)
      }
      const w = maxU - minU
      const h = maxV - minV
      const area = w * h
      if (area < bestArea) {
        bestArea = area
        best = { shortSide: Math.min(w, h), longSide: Math.max(w, h) }
      }
    }
    if (!best) throw new Error('폴리곤에서 외접 사각형을 구할 수 없습니다')
    return best
  }

  scale(sx: number, sy: number): Polygon {
    return Polygon.of(this.points.map((p) => ({ x: p.x * sx, y: p.y * sy })))
  }

  translate(dx: number, dy: number): Polygon {
    return Polygon.of(this.points.map((p) => ({ x: p.x + dx, y: p.y + dy })))
  }

  // 무한 직선으로 자른다. 조각들(왼쪽·위쪽이 먼저) 또는, 선이 실을 가르지 않으면 원본 하나.
  //
  // 볼록이면 반평면 클리핑(빠르고 정확), 오목이면 평면 그래프의 면(face) 추출로 자른다.
  // 오목 실은 병합(M)으로 생긴다 — 거실+침실을 ㄴ자로 합친 실도 다시 자를 수 있어야 한다.
  // 오목 실은 한 선이 3조각 이상을 만들 수 있다(호출부가 그 사실을 보고 판단한다).
  splitByLine(line: CutLine): Polygon[] {
    if (!this.isConvex) return splitConcave(this, line)
    const rad = (line.angleDeg * Math.PI) / 180
    // 방향 d = (cos, sin) → 법선 n = (-sin, cos). 부호가 반평면을 가른다.
    const nx = -Math.sin(rad)
    const ny = Math.cos(rad)
    const side = (p: Pt): number => nx * (p.x - line.x) + ny * (p.y - line.y)

    const tol = Math.sqrt(this.area) * 1e-9 + EPS
    const sides = this.points.map(side)
    const hasPos = sides.some((s) => s > tol)
    const hasNeg = sides.some((s) => s < -tol)
    if (!hasPos || !hasNeg) return [this] // 선이 밖에 있거나 변·꼭짓점만 스친다

    const pos = clipHalfPlane(this.points, sides, +1, tol)
    const neg = clipHalfPlane(this.points, sides, -1, tol)
    const pieces = [pos, neg].filter((pts) => pts.length >= 3).map((pts) => Polygon.of(dedupe(pts)))
    if (pieces.length < 2) return [this]

    // 결정적 순서: 왼쪽(→위쪽) 조각이 먼저. id를 -1/-2로 붙이는 쪽이 이 순서를 신뢰한다.
    return pieces.sort((a, b) => a.centroid.x - b.centroid.x || a.centroid.y - b.centroid.y)
  }
}

// ── 오목 폴리곤 절단 (평면 그래프의 면 추출) ──
//
// 반평면 클리핑(Sutherland–Hodgman)은 오목에서 틀린 도형을 낸다. 대신:
//  1) 경계를 절단선과의 교점에서 쪼갠 '증강 링'을 만든다
//  2) 교점을 선 위 파라미터 t로 정렬해, 폴리곤 내부를 지나는 구간(다리)을 찾는다
//  3) 링 변 + 다리로 이루어진 평면 그래프에서 면을 추출한다 → 그 면들이 조각이다
const splitConcave = (poly: Polygon, line: CutLine): Polygon[] => {
  const rad = (line.angleDeg * Math.PI) / 180
  const nx = -Math.sin(rad)
  const ny = Math.cos(rad)
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  const side = (p: Pt): number => nx * (p.x - line.x) + ny * (p.y - line.y)
  const along = (p: Pt): number => dx * (p.x - line.x) + dy * (p.y - line.y)
  const tol = Math.sqrt(poly.area) * 1e-9 + EPS

  // 1) 증강 링: 변이 선을 가로지르면 교점을 끼워 넣는다.
  const pts = ccw(poly.points)
  const ring: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    ring.push(a)
    const sa = side(a)
    const sb = side(b)
    if ((sa > tol && sb < -tol) || (sa < -tol && sb > tol)) {
      const t = sa / (sa - sb)
      ring.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }

  // 2) 선 위에 놓인 정점 중 '실제로 가로지르는' 것만 교점으로 센다(스치는 꼭짓점은 뺀다).
  const onLine = ring.map((p) => Math.abs(side(p)) <= tol)
  const crossings: number[] = []
  for (let i = 0; i < ring.length; i++) {
    if (!onLine[i]) continue
    const prev = prevOffLine(ring, onLine, i, side, tol)
    const next = nextOffLine(ring, onLine, i, side, tol)
    if (prev !== 0 && next !== 0 && Math.sign(prev) !== Math.sign(next)) crossings.push(i)
  }
  if (crossings.length < 2) return [poly]

  // 3) t 순으로 정렬한 뒤 짝을 지어 내부를 지나는 구간만 다리로 쓴다.
  const sorted = [...crossings].sort((i, j) => along(ring[i]) - along(ring[j]))
  const bridges: [number, number][] = []
  for (let k = 0; k + 1 < sorted.length; k += 2) {
    const u = ring[sorted[k]]
    const v = ring[sorted[k + 1]]
    const mid = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 }
    if (poly.contains(mid)) bridges.push([sorted[k], sorted[k + 1]])
  }
  if (bridges.length === 0) return [poly]

  // 4) 면 추출: 각 정점에서 나가는 변을 모으고, 들어온 방향 기준으로 가장 시계방향인 변을 따라간다.
  const out = new Map<number, number[]>()
  const push = (from: number, to: number) => {
    const list = out.get(from) ?? []
    list.push(to)
    out.set(from, list)
  }
  for (let i = 0; i < ring.length; i++) push(i, (i + 1) % ring.length)
  for (const [u, v] of bridges) {
    push(u, v)
    push(v, u)
  }

  const used = new Set<string>()
  const faces: Pt[][] = []
  for (const [from, tos] of out) {
    for (const to of tos) {
      const key = `${from}->${to}`
      if (used.has(key)) continue
      const face = walkFace(ring, out, used, from, to)
      if (face.length >= 3) faces.push(face)
    }
  }

  // 내부 면만 남긴다(외곽 면은 반대 방향이라 부호 넓이가 음수다).
  const pieces = faces
    .filter((f) => signedArea2(f) > 0)
    .map((f) => Polygon.of(dedupeCollinear(dedupe(f))))
    .filter((p) => p.area > tol)

  if (pieces.length < 2) return [poly]
  return pieces.sort((a, b) => a.centroid.x - b.centroid.x || a.centroid.y - b.centroid.y)
}

const prevOffLine = (ring: readonly Pt[], onLine: readonly boolean[], i: number, side: (p: Pt) => number, tol: number): number => {
  for (let k = 1; k <= ring.length; k++) {
    const j = (i - k + ring.length) % ring.length
    if (!onLine[j]) return Math.abs(side(ring[j])) > tol ? side(ring[j]) : 0
  }
  return 0
}

const nextOffLine = (ring: readonly Pt[], onLine: readonly boolean[], i: number, side: (p: Pt) => number, tol: number): number => {
  for (let k = 1; k <= ring.length; k++) {
    const j = (i + k) % ring.length
    if (!onLine[j]) return Math.abs(side(ring[j])) > tol ? side(ring[j]) : 0
  }
  return 0
}

// 한 면을 따라간다: 도착 정점에서 '들어온 변의 반대 방향'부터 시계방향으로 가장 가까운 변을 고른다.
const walkFace = (
  ring: readonly Pt[],
  out: Map<number, number[]>,
  used: Set<string>,
  startFrom: number,
  startTo: number,
): Pt[] => {
  const face: Pt[] = []
  let from = startFrom
  let to = startTo
  for (let guard = 0; guard < ring.length * 4 + 8; guard++) {
    const key = `${from}->${to}`
    if (used.has(key)) break
    used.add(key)
    face.push(ring[from])
    const back = Math.atan2(ring[from].y - ring[to].y, ring[from].x - ring[to].x)
    const cands = (out.get(to) ?? []).filter((n) => n !== from || (out.get(to) ?? []).length === 1)
    if (cands.length === 0) break
    let best = cands[0]
    let bestTurn = Infinity
    for (const n of cands) {
      const ang = Math.atan2(ring[n].y - ring[to].y, ring[n].x - ring[to].x)
      let turn = back - ang // 시계방향으로 얼마나 도는가
      while (turn <= 0) turn += Math.PI * 2
      while (turn > Math.PI * 2) turn -= Math.PI * 2
      if (turn < bestTurn) {
        bestTurn = turn
        best = n
      }
    }
    from = to
    to = best
    if (from === startFrom && to === startTo) break
  }
  return face
}

// 인접하지 않은 두 실은 합칠 수 없다(떨어져 있거나 꼭짓점만 닿는다).
export class NotAdjacentError extends Error {
  constructor() {
    super('두 실이 붙어 있지 않습니다(변을 공유해야 합니다)')
    this.name = 'NotAdjacentError'
  }
}

// 내부가 겹치지 않고 변을 공유하는 두 폴리곤의 합집합.
//
// 경계 순회로 구한다: 두 폴리곤을 같은 방향(CCW)으로 맞추면 **공유 변은 서로 반대 방향**으로
// 나타난다. 그 짝을 지운 나머지 변을 이어 붙이면 바깥 경계 하나가 남는다.
// (결과는 오목할 수 있다 — 거실+침실이 ㄴ자가 되는 것이 정상이다.)
export const unionPolygons = (a: Polygon, b: Polygon): Polygon => {
  if (sharedEdgeLength(a, b) <= 0) throw new NotAdjacentError()

  const A = ccw(a.points)
  const B = ccw(b.points)
  const ea = splitAt(A, B)
  const eb = splitAt(B, A)
  const keep = [
    ...ea.filter((e) => !hasOpposite(e, eb)),
    ...eb.filter((e) => !hasOpposite(e, ea)),
  ]
  if (keep.length < 3) throw new NotAdjacentError()
  return Polygon.of(chain(keep))
}

const same = (p: Pt, q: Pt): boolean => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6

// 반시계 방향으로 정규화 — 공유 변이 반대 방향으로 나타나게 하는 전제.
const ccw = (pts: readonly Pt[]): Pt[] => (signedArea2(pts) < 0 ? [...pts].reverse() : [...pts])

// P의 각 변을 Q의 정점에서 쪼갠다(벽 하나를 부분적으로만 공유하는 경우를 다룬다).
const splitAt = (P: readonly Pt[], Q: readonly Pt[]): [Pt, Pt][] => {
  const out: [Pt, Pt][] = []
  for (let i = 0; i < P.length; i++) {
    const a = P[i]
    const b = P[(i + 1) % P.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const cuts = Q.filter((q) => onSegment(a, b, q) && !same(q, a) && !same(q, b))
      .map((q) => ({ q, t: ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / (len * len) }))
      .sort((x, y) => x.t - y.t)
    let cur = a
    for (const c of cuts) {
      out.push([cur, c.q])
      cur = c.q
    }
    out.push([cur, b])
  }
  return out
}

const hasOpposite = (e: [Pt, Pt], others: [Pt, Pt][]): boolean =>
  others.some((f) => same(f[0], e[1]) && same(f[1], e[0]))

// 남은 변들을 한 고리로 잇는다. 고리가 하나로 닫히지 않으면 합집합이 성립하지 않는다.
const chain = (edgeList: [Pt, Pt][]): Pt[] => {
  const rest = [...edgeList]
  const first = rest.shift() as [Pt, Pt]
  const loop: Pt[] = [first[0]]
  let cur = first[1]
  while (rest.length > 0) {
    if (same(cur, loop[0])) break // 고리가 닫혔다
    const idx = rest.findIndex((e) => same(e[0], cur))
    if (idx < 0) throw new NotAdjacentError() // 끊어졌다 — 하나의 실이 되지 않는다
    const [, end] = rest.splice(idx, 1)[0]
    loop.push(cur)
    cur = end
  }
  if (!same(cur, loop[0])) throw new NotAdjacentError()
  return dedupeCollinear(loop)
}

// 일직선 위의 중간 정점(공유 벽을 지운 자리)을 정리한다 — 사각형 2개를 합치면 정점 4개여야 한다.
const dedupeCollinear = (pts: Pt[]): Pt[] => {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const cur = pts[i]
    const next = pts[(i + 1) % pts.length]
    const c = (cur.x - prev.x) * (next.y - prev.y) - (cur.y - prev.y) * (next.x - prev.x)
    const scale = Math.hypot(cur.x - prev.x, cur.y - prev.y) * Math.hypot(next.x - prev.x, next.y - prev.y)
    if (scale > 0 && Math.abs(c) / scale < 1e-9) continue // 일직선 → 버린다
    out.push(cur)
  }
  return out
}

// 두 폴리곤이 공유하는 경계의 총 길이. 0이면 인접하지 않는다(떨어져 있거나 점만 닿는다).
// 병합(M)의 전제다 — 변을 공유해야 하나의 실로 이어진다.
export const sharedEdgeLength = (a: Polygon, b: Polygon): number => {
  let total = 0
  for (const [a1, a2] of edges(a)) {
    for (const [b1, b2] of edges(b)) {
      total += collinearOverlap(a1, a2, b1, b2)
    }
  }
  return total
}

const edges = (p: Polygon): [Pt, Pt][] =>
  p.points.map((v, i) => [v, p.points[(i + 1) % p.points.length]] as [Pt, Pt])

// 두 선분이 같은 직선 위에 있을 때 겹치는 길이(아니면 0).
const collinearOverlap = (a1: Pt, a2: Pt, b1: Pt, b2: Pt): number => {
  const len = Math.hypot(a2.x - a1.x, a2.y - a1.y)
  if (len < EPS) return 0
  const ux = (a2.x - a1.x) / len
  const uy = (a2.y - a1.y) / len
  const off = (p: Pt): number => -(p.x - a1.x) * uy + (p.y - a1.y) * ux // 직선까지의 부호거리
  const tol = 1e-6
  if (Math.abs(off(b1)) > tol || Math.abs(off(b2)) > tol) return 0 // 같은 직선이 아니다

  const proj = (p: Pt): number => (p.x - a1.x) * ux + (p.y - a1.y) * uy
  const [b0, b3] = [proj(b1), proj(b2)].sort((x, y) => x - y)
  const lo = Math.max(0, b0)
  const hi = Math.min(len, b3)
  return hi - lo > tol ? hi - lo : 0
}

// 선분 위의 점인가(경계 판정).
const onSegment = (a: Pt, b: Pt, p: Pt): boolean => {
  const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (len < EPS) return false
  if (Math.abs(c) / len > 1e-9) return false
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)
  return dot >= -1e-9 && dot <= len * len + 1e-9
}

// Sutherland–Hodgman: keep 부호 쪽 반평면만 남긴다.
const clipHalfPlane = (pts: readonly Pt[], sides: readonly number[], keep: 1 | -1, tol: number): Pt[] => {
  const out: Pt[] = []
  const inside = (s: number): boolean => s * keep >= -tol
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const sa = sides[i]
    const sb = sides[(i + 1) % pts.length]
    if (inside(sa)) out.push(a)
    if (inside(sa) !== inside(sb)) {
      const t = sa / (sa - sb)
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  return out
}

const dedupe = (pts: readonly Pt[]): Pt[] => {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) continue
    out.push(p)
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) out.pop()
  return out
}

// Andrew monotone chain — obb의 전제(볼록 껍질).
const convexHull = (pts: readonly Pt[]): Pt[] => {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (s.length < 3) return s
  const half = (arr: Pt[]): Pt[] => {
    const h: Pt[] = []
    for (const p of arr) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop()
      h.push(p)
    }
    h.pop()
    return h
  }
  return [...half(s), ...half([...s].reverse())]
}

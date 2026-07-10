// 실내기 좌표 배치 규칙 (Generation 컨텍스트 · 순수 도메인 서비스).
//
// 실 안에 N대를 놓을 때 어디에 놓는가. 확산범위가 겹치지 않도록 균등 분산한다
// (근거: doc/05_설계결정/실내기_자동배치_룰.md §3 — 대수는 부하와 확산범위 중 큰 쪽이 정한다).
//
// 좌표계는 도면(뷰어) 좌표다. 이 좌표는 산출 도면에 그대로 실린다.

export interface UnitPosition {
  x: number
  y: number
  rot: number // 도(0~359)
}

export interface RoomRect {
  x: number
  y: number
  w: number
  h: number
}

// 실 사각형과 대수로 좌표를 만든다. 셀이 최대한 정사각형이 되도록 열 수를 고른 뒤
// 격자 중심에 하나씩 놓는다. 결과는 항상 실 내부이고 서로 겹치지 않는다.
export const layoutPositions = (rect: RoomRect, count: number): UnitPosition[] => {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error('count는 0 이상의 정수여야 합니다')
  }
  if (!(rect.w > 0) || !(rect.h > 0)) {
    throw new Error('실의 폭·높이는 0보다 커야 합니다')
  }
  if (count === 0) return []

  // 셀 종횡비가 1에 가깝도록: cols ≈ √(count × w/h)
  const cols = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * rect.w) / rect.h))))
  const rows = Math.ceil(count / cols)

  const out: UnitPosition[] = []
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    out.push({
      x: rect.x + (rect.w * (c + 0.5)) / cols,
      y: rect.y + (rect.h * (r + 0.5)) / rows,
      rot: 0,
    })
  }
  return out
}

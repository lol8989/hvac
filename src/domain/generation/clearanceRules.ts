// 실외기 이격거리 (Generation 컨텍스트 · 순수 도메인 서비스).
//
// 근거: doc/05_설계결정/실내기_자동배치_룰.md §7 — 본체 1240 × 760, 측 250 / 간 200 / 후 500 / 전 900.
//
// 범위 (주인님 확정 2026-07-10): **실외기끼리의 간격만 검증한다.**
// 측 250(벽까지) · 후 500(벽까지)은 벽·장애물 정보가 필요한데 POC 도면에는 없다 → 보류.
//
// 판정 (모든 길이는 mm, 좌표는 실외기 본체의 중심):
//   gapX = |dx| − 1240   (좌우 방향 면과 면 사이 거리, 음수면 x축으로 겹침)
//   gapY = |dy| − 760    (앞뒤 방향 면과 면 사이 거리, 음수면 y축으로 겹침)
//
//   위반 ⟺ gapX < 200 그리고 gapY < 900
//
// 즉 좌우로 200mm 이상 떨어졌거나(다른 열), 앞뒤로 900mm 이상 떨어졌으면(토출면 확보) 괜찮다.
// 둘 다 못 지키면 나란히 붙었거나 토출면을 막은 것이다. 본체가 겹치면 두 gap이 모두 음수라
// 자동으로 위반이 된다.

export const ODU_BODY_W_MM = 1240 // 본체 폭(좌우)
export const ODU_BODY_D_MM = 760 // 본체 깊이(앞뒤)
export const MIN_SIDE_GAP_MM = 200 // 실외기 간 좌우 간격
export const MIN_FRONT_GAP_MM = 900 // 실외기 간 앞뒤(토출면) 간격

export interface OutdoorPlacementMm {
  key: string
  label: string
  x: number // 본체 중심 (mm)
  y: number
}

export interface ClearanceViolation {
  a: string // 그룹 라벨
  b: string
  gapXMm: number // 면과 면 사이 거리(음수 = 겹침)
  gapYMm: number
  message: string
}

const round = (v: number): number => Math.round(v)

// 두 실외기 쌍마다 간격을 검사한다. 위반 목록은 결정적 순서(입력 순서)로 반환.
export const checkClearances = (placements: readonly OutdoorPlacementMm[]): ClearanceViolation[] => {
  const out: ClearanceViolation[] = []
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i]
      const b = placements[j]
      const gapX = Math.abs(a.x - b.x) - ODU_BODY_W_MM
      const gapY = Math.abs(a.y - b.y) - ODU_BODY_D_MM
      if (gapX >= MIN_SIDE_GAP_MM || gapY >= MIN_FRONT_GAP_MM) continue

      const overlapping = gapX < 0 && gapY < 0
      const message = overlapping
        ? `${a.label} ↔ ${b.label}: 본체가 겹칩니다`
        : gapY < 0
          ? `${a.label} ↔ ${b.label}: 좌우 간격 ${round(gapX)}mm (최소 ${MIN_SIDE_GAP_MM}mm)`
          : `${a.label} ↔ ${b.label}: 앞뒤 간격 ${round(gapY)}mm (최소 ${MIN_FRONT_GAP_MM}mm)`
      out.push({ a: a.label, b: b.label, gapXMm: round(gapX), gapYMm: round(gapY), message })
    }
  }
  return out
}

// 실 라벨(실명·면적) 기준점 — 화면 뷰어와 산출 도면이 **같은 자리**에 라벨을 둔다(SSOT).
//
// 예전엔 라벨을 무게중심에 뒀는데, 실내기 심볼도 무게중심에 놓인다(layoutPositions는 1대일 때
// 격자 중심 = 중앙). 산출 SVG는 실 라벨을 먼저 그리고 심볼을 나중에 그려서 **심볼의 흰 본체가
// 실명을 덮었다** — 1대짜리 실은 도면에서 실명이 사라졌다(적대적 QA).
//
// 그렇다고 bbox 좌상단으로 옮기면 잘린 실(사선·오목)에서 라벨이 실 밖으로 나간다.
// 그래서 **무게중심을 지나는 세로선이 실 안을 지나는 구간의 위쪽**에 둔다.
// 어떤 형상이든 실 내부가 보장되고, 중앙(심볼 자리)은 비워 둔다.
import { Polygon } from '../../domain/shared/Polygon'
import type { Pt } from '../../domain/shared/Polygon'

export const LABEL_INSET = 16 // 실 상단에서 라벨 기준선까지(도면 좌표 단위)

// x를 지나는 세로선이 폴리곤 내부를 지나는 구간들 [y0, y1]. 표준 반열림 규칙이라 항상 짝수 교차.
const verticalSpans = (points: readonly Pt[], x: number): { y0: number; y1: number }[] => {
  const ys: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a.x > x === b.x > x) continue // 세로선을 가로지르지 않는 변
    ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y))
  }
  ys.sort((p, q) => p - q)
  const spans: { y0: number; y1: number }[] = []
  for (let i = 0; i + 1 < ys.length; i += 2) spans.push({ y0: ys[i], y1: ys[i + 1] })
  return spans
}

export const roomLabelAnchor = (points: readonly Pt[], inset = LABEL_INSET): Pt => {
  if (points.length < 3) return points[0] ?? { x: 0, y: 0 }
  const c = Polygon.of(points).centroid
  const spans = verticalSpans(points, c.x)
  if (spans.length === 0) return c // 축퇴(모든 변이 세로선과 평행 등) — 기존 동작으로 폴백
  // 오목 실에서는 세로선이 여러 구간을 지난다. 무게중심이 속한 구간을 쓰고, 없으면 가장 위 구간.
  const span = spans.find((s) => c.y >= s.y0 && c.y <= s.y1) ?? spans[0]
  // 구간이 인셋의 두 배보다 낮으면 상단 인셋이 아래 경계를 넘는다 → 구간 가운데로 물러난다.
  return { x: c.x, y: Math.min(span.y0 + inset, (span.y0 + span.y1) / 2) }
}

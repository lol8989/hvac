// 뷰포트 변환(팬·줌·화면맞춤) — 도면 뷰어의 좌표계 토대.
//
// view(현재 보이는 도면 영역 x·y·w·h)가 SSOT다. 확대/축소는 w·h를 줄이고, 팬은 x·y를 옮긴다.
// 화면 px ↔ 도면 좌표 변환(toSvg)과 휠 줌·화면 크기 추적을 여기 모은다.
// (팬 드래그 자체는 드래그 멀티플렉서가 panRef로 처리한다 — 여기선 setView만 넘긴다.)
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'

export interface ViewBox { x: number; y: number; w: number; h: number }

export interface PanZoomInput {
  svgRef: RefObject<SVGSVGElement | null>
  planW: number
  planH: number
  // 층 전환: 활성 층 실들을 감싸는 bbox. 있으면 여기에 맞춘다(없으면 전체 도면).
  fitBounds?: ViewBox
}

export interface PanZoom {
  view: ViewBox
  setView: Dispatch<SetStateAction<ViewBox>> // 팬 드래그(멀티플렉서)가 직접 쓴다
  svgW: number // 화면상 SVG 폭(px) — 타일 레벨 선택용
  zoomPct: number
  toSvg: (cx: number, cy: number) => DOMPoint | null // 화면 px → 도면 좌표
  zoomBy: (factor: number) => void // 버튼 확대(factor<1)/축소(factor>1), 중심 고정
  resetView: () => void // 화면 맞춤(FIT)으로 되돌린다
}

export function usePanZoom({ svgRef, planW, planH, fitBounds }: PanZoomInput): PanZoom {
  const FIT = useMemo(() => {
    const b = fitBounds ?? { x: 0, y: 0, w: planW, h: planH }
    const px = b.w * 0.05, py = b.h * 0.06 // 여백은 폭·높이 비례
    return { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py }
  }, [fitBounds, planW, planH])
  const BASE_W = FIT.w
  const MIN_W = BASE_W / 8
  const MAX_W = BASE_W * 3
  const clampW = useCallback((nw: number, nh: number): [number, number] => {
    if (nw < MIN_W) { const k = MIN_W / nw; return [nw * k, nh * k] }
    if (nw > MAX_W) { const k = MAX_W / nw; return [nw * k, nh * k] }
    return [nw, nh]
  }, [MIN_W, MAX_W])

  const [view, setView] = useState<ViewBox>(FIT)
  // 층 전환·도면 로드로 맞춤 범위(FIT)가 바뀌면 그 범위로 뷰를 다시 맞춘다.
  // 이펙트 대신 렌더 중 변화를 감지해 즉시 맞춘다(스테일 뷰가 한 프레임 그려지지 않는다).
  const [prevFit, setPrevFit] = useState(FIT)
  if (prevFit !== FIT) {
    setPrevFit(FIT)
    setView(FIT)
  }

  // SVG 화면 폭(px) 추적 — 타일 레벨 선택(화면 해상도 ≒ 타일 해상도)에 사용.
  const [svgW, setSvgW] = useState(1200)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const update = () => setSvgW(el.clientWidth || 1200)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [svgRef])

  const toSvg = useCallback((cx: number, cy: number): DOMPoint | null => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = cx
    pt.y = cy
    return pt.matrixTransform(ctm.inverse())
  }, [svgRef])

  // 휠 확대/축소: 커서 아래 지점 고정.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const ctm = svg.getScreenCTM()
      if (!ctm) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const p = pt.matrixTransform(ctm.inverse())
      const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1
      setView((v) => {
        const [nw, nh] = clampW(v.w * factor, v.h * factor)
        return { x: p.x - ((p.x - v.x) / v.w) * nw, y: p.y - ((p.y - v.y) / v.h) * nh, w: nw, h: nh }
      })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [svgRef, clampW])

  // 버튼 줌: 화면 중심을 고정하고 배율만 바꾼다.
  const zoomBy = useCallback((factor: number) => {
    setView((v) => {
      const [nw, nh] = clampW(v.w * factor, v.h * factor)
      return { x: v.x + (v.w - nw) / 2, y: v.y + (v.h - nh) / 2, w: nw, h: nh }
    })
  }, [clampW])
  const resetView = useCallback(() => setView(FIT), [FIT])

  const zoomPct = Math.round((BASE_W / view.w) * 100)

  return { view, setView, svgW, zoomPct, toSvg, zoomBy, resetView }
}

// Vitest 공통 셋업. jsdom 컴포넌트 테스트용 매처·정리 + 미구현 브라우저 API 스텁.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// jsdom 미구현 API 스텁(SVG 뷰어 테스트용). node 환경에서는 window가 없어 건너뛴다.
if (typeof window !== 'undefined') {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }
  // getScreenCTM/createSVGPoint 미구현 → 항등 변환 스텁: 화면 좌표 == SVG 좌표로 취급해
  // 드래그·클릭 상호작용 테스트가 가능하다(줌/뷰박스 변환은 테스트하지 않음).
  const svgProto = window.SVGSVGElement?.prototype as {
    getScreenCTM?: () => DOMMatrix | null
    createSVGPoint?: () => SVGPoint
  } | undefined
  if (svgProto && !svgProto.getScreenCTM) {
    svgProto.getScreenCTM = function () {
      const m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, inverse: () => m }
      return m as unknown as DOMMatrix
    }
    svgProto.createSVGPoint = function () {
      const pt = {
        x: 0,
        y: 0,
        matrixTransform: () => ({ x: pt.x, y: pt.y }),
      }
      return pt as unknown as SVGPoint
    }
  }
}

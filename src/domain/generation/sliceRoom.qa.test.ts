// 적대적 QA 회귀 (2026-07-14). 슬라이싱 워크플로가 확인한 결함을 테스트로 고정한다.
import { describe, it, expect } from 'vitest'
import { Room } from './Room'
import { Polygon } from '../shared/Polygon'
import { sliceRoom, TooThinSliceError, MIN_ROOM_AREA_M2, MIN_ROOM_SHORT_SIDE_M } from './sliceRoom'
import { layoutPositions } from './layoutPositions'
import { Placement } from './Placement'

const AC_001 = Room.create({
  id: 'AC_001', floor: '지상1층', name: '거실', areaM2: 31.89, usage: '거실',
  facility: 'OFFICE', shortSideM: 4.37, longSideM: 7.29,
})
const BASE = Polygon.rect(24, 24, 250, 150)

// [QA #2] MIN_SLICE_RATIO는 '부모 대비 상대 넓이'만 봤다 → 폭 2cm짜리 '실'이 도메인에 들어왔다.
// 상대비만으로는 재귀 슬라이스가 실을 무한히 작게 만든다(매번 부모 기준 2%).
describe('sliceRoom — 실이 될 수 없는 조각은 만들지 않는다', () => {
  it('절대 면적 하한(1㎡) 미만 조각은 거부한다', () => {
    // 부모 31.89㎡의 3% 지점 = 약 0.96㎡ → 상대비(2%)는 통과하지만 절대 면적이 모자란다
    expect(() => sliceRoom(AC_001, BASE, { x: 24 + 250 * 0.029, y: 99, angleDeg: 90 })).toThrow(TooThinSliceError)
  })

  it('단변 하한(0.5m) 미만인 얇은 띠는 거부한다', () => {
    // 15° 사선으로 한 번 자른 뒤, 같은 각도 평행선을 1.9px 옆에 → 폭 0.04m짜리 띠
    const [a] = sliceRoom(AC_001, BASE, { x: 149, y: 99, angleDeg: 15 })
    const rad = (15 * Math.PI) / 180
    const px = 149 + -Math.sin(rad) * 1.9
    const py = 99 + Math.cos(rad) * 1.9
    expect(() => sliceRoom(a.room, a.polygon, { x: px, y: py, angleDeg: 15 })).toThrow(TooThinSliceError)
  })

  it('하한 상수는 실로서 의미 있는 값이다', () => {
    expect(MIN_ROOM_AREA_M2).toBeGreaterThanOrEqual(1)
    expect(MIN_ROOM_SHORT_SIDE_M).toBeGreaterThanOrEqual(0.5)
  })

  it('정상 절단(반으로 가르기)은 여전히 통과한다', () => {
    expect(() => sliceRoom(AC_001, BASE, { x: 149, y: 99, angleDeg: 90 })).not.toThrow()
  })
})

// [QA #1] 얇고 긴 폴리곤에서 layoutPositions가 raw Error를 던졌다.
// bbox 균등 샘플링이라 폴리곤이 bbox의 1%만 차지하면 내부점을 못 찾았다 —
// 기하적으로 자리가 있는데 rejection sampling이 실패한 것이다.
describe('layoutPositions — 얇고 긴 실에서도 자리를 찾는다', () => {
  it('길이 7m · 폭 0.5m 띠에 3대를 놓는다(모두 내부)', () => {
        const strip = Polygon.of([
      { x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 50 }, { x: 0, y: 50 },
    ])
    const pts = layoutPositions(strip, 3)
    expect(pts).toHaveLength(3)
    for (const p of pts) expect(strip.contains(p)).toBe(true)
  })

  it('사선으로 기울어진 얇은 띠(bbox의 3%)에서도 3대를 놓는다', () => {
    // 대각선 띠: bbox는 크지만 폴리곤은 얇다 — 예전 격자 샘플링이 실패하던 형상
    const diag = Polygon.of([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 600, y: 380 }, { x: 590, y: 390 },
    ])
    const pts = layoutPositions(diag, 3)
    expect(pts).toHaveLength(3)
    for (const p of pts) expect(diag.contains(p)).toBe(true)
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(3)
  })
})

// [QA #5·#21] 자르기가 부모의 사용자 오버라이드(직접 고른 모델·대수)를 AI 값으로 강등시켰다.
// '수정 셀은 AI 재선정에도 보존한다'는 정책이 자르기 경로에서만 깨졌다.
describe('Placement — AI 재선정이 사용자가 옮긴 좌표를 지우지 않는다', () => {
  it('[QA #20] 대수가 그대로면 AI 재선정이 좌표를 유지한다', () => {
    const moved = [{ x: 111, y: 222, rot: 90 }]
    const p = Placement.ai('AC_001', { modelCode: 'M1', quantity: 1 }, moved)
    const next = p.withAiSelection({ modelCode: 'M2', quantity: 1 }, [{ x: 0, y: 0, rot: 0 }])
    expect(next.positions).toEqual(moved) // 사용자가 도면에서 놓은 자리를 지키다
    expect(next.effectiveSelection.modelCode).toBe('M2') // 모델은 AI값으로 갱신
  })

  it('대수가 바뀌면 AI 좌표를 받는다', () => {
    const p = Placement.ai('AC_001', { modelCode: 'M1', quantity: 1 }, [{ x: 111, y: 222, rot: 0 }])
    const ai = [{ x: 10, y: 10, rot: 0 }, { x: 20, y: 20, rot: 0 }]
    const next = p.withAiSelection({ modelCode: 'M1', quantity: 2 }, ai)
    expect(next.positions).toEqual(ai)
  })
})

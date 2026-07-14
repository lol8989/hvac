import { describe, it, expect } from 'vitest'
import { pointInZone, zoneOfPoint, roomIdsForUnits, zoneAreaM2, zoneHitsRect, isRectZone, zoneBounds, rectPoints } from './geometry'
import type { ZoneBox, UnitSym } from './geometry'

const z = (id: string, x: number, y: number, w: number, h: number): ZoneBox => ({ id, name: id, points: rectPoints(x, y, w, h) })
// 실내기 심볼 1개 = 실내기 1대. roomId가 소속 실이고, id는 `${roomId}#${n}`.
const u = (roomId: string, x: number, y: number, n = 1): UnitSym => ({ id: `${roomId}#${n}`, roomId, x, y, rot: 0 })

const ZONES: ZoneBox[] = [
  z('AC_001', 0, 0, 100, 100),
  z('AC_002', 100, 0, 100, 100),
]

// V(자르기)로 생긴 실 — 사각형이 아니다.
const TRI: ZoneBox = { id: 'AC_003', name: 'AC_003', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }] }

describe('pointInZone', () => {
  it('내부 점은 true', () => {
    expect(pointInZone(50, 50, ZONES[0])).toBe(true)
  })
  it('경계 점은 포함(true)', () => {
    expect(pointInZone(0, 0, ZONES[0])).toBe(true)
    expect(pointInZone(100, 100, ZONES[0])).toBe(true)
  })
  it('외부 점은 false', () => {
    expect(pointInZone(150, 50, ZONES[0])).toBe(false)
    expect(pointInZone(-1, 50, ZONES[0])).toBe(false)
  })
  it('사선으로 잘린 실은 빗변 바깥을 제외한다(bbox가 아니다)', () => {
    expect(pointInZone(10, 10, TRI)).toBe(true)
    expect(pointInZone(90, 90, TRI)).toBe(false) // bbox 안이지만 실 밖
  })
})

describe('zoneOfPoint', () => {
  it('점을 포함하는 존을 반환', () => {
    expect(zoneOfPoint(150, 50, ZONES)?.id).toBe('AC_002')
  })
  it('어느 존에도 없으면 null', () => {
    expect(zoneOfPoint(500, 500, ZONES)).toBeNull()
  })
  it('겹치면 첫 번째(위 레이어) 존을 반환', () => {
    const overlap: ZoneBox[] = [z('TOP', 0, 0, 100, 100), z('BOTTOM', 0, 0, 100, 100)]
    expect(zoneOfPoint(50, 50, overlap)?.id).toBe('TOP')
  })
})

describe('roomIdsForUnits (선택 심볼 → 담당 실 id, 위치 우선)', () => {
  it('심볼이 다른 실 위로 옮겨지면 그 위치의 실을 반환한다 (드래그 이동 하이라이팅)', () => {
    // 소속은 AC_001인데 좌표는 AC_002 영역 → 위치가 이긴다
    expect(roomIdsForUnits([u('AC_001', 150, 50)], ZONES)).toEqual(['AC_002'])
  })
  it('심볼이 어느 존 밖이면 소속 실(roomId)로 폴백한다', () => {
    expect(roomIdsForUnits([u('AC_001', 999, 999)], ZONES)).toEqual(['AC_001'])
  })
  it('같은 실의 여러 대수는 하나로 합친다', () => {
    const syms = [u('AC_001', 20, 20, 1), u('AC_001', 80, 80, 2)]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('소속 실이 없고 좌표도 실 밖이면 무시한다 (실외기 심볼 등)', () => {
    const syms = [u('AC_001', 50, 50), { id: 'ODU1', x: 999, y: 999, rot: 0 }]
    expect(roomIdsForUnits(syms, ZONES)).toEqual(['AC_001'])
  })
  it('선택 심볼이 모두 실과 무관/밖이면 빈 배열', () => {
    expect(roomIdsForUnits([{ id: 'ODU1', x: 999, y: 999, rot: 0 }], ZONES)).toEqual([])
  })
})

// 면적은 도메인이 말하는 값이다 — 뷰어가 기하에서 따로 계산하면 화면과 산출물이 갈라진다.
// (예전엔 mmPerUnit으로 폴리곤 넓이를 환산했는데, 목업 폴리곤은 DXF 실좌표가 아니라
//  도면 라벨이 622㎡, 선정표가 31.9㎡를 말했다 — 적대적 QA 2026-07-14)
describe('zoneAreaM2 (존 면적 ㎡)', () => {
  it('도메인 실 면적을 그대로 돌려준다', () => {
    expect(zoneAreaM2(31.89)).toBe(31.89)
  })
  it('실 면적을 모르면 null(라벨을 그리지 않는다)', () => {
    expect(zoneAreaM2(undefined)).toBeNull()
  })
})

describe('zoneHitsRect (마퀴 교차)', () => {
  it('마퀴가 존을 덮으면 true', () => {
    expect(zoneHitsRect({ x: -10, y: -10, w: 500, h: 500 }, ZONES[0])).toBe(true)
  })
  it('마퀴가 존 일부만 걸쳐도 true', () => {
    expect(zoneHitsRect({ x: 90, y: 40, w: 20, h: 20 }, ZONES[0])).toBe(true)
  })
  it('떨어져 있으면 false', () => {
    expect(zoneHitsRect({ x: 300, y: 300, w: 50, h: 50 }, ZONES[0])).toBe(false)
  })
  it('bbox는 겹치지만 폴리곤은 안 겹치면 false', () => {
    // 삼각형의 빗변 바깥(우하단 모서리) — bbox로 판정하면 잘못 걸린다
    expect(zoneHitsRect({ x: 92, y: 92, w: 6, h: 6 }, TRI)).toBe(false)
  })
})

describe('isRectZone / zoneBounds', () => {
  it('축정렬 사각형은 리사이즈 가능한 실이다', () => {
    expect(isRectZone(ZONES[0])).toBe(true)
    expect(zoneBounds(ZONES[0])).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
  it('잘린 실은 사각형이 아니다(모서리 핸들이 붙지 않는다)', () => {
    expect(isRectZone(TRI)).toBe(false)
    expect(zoneBounds(TRI)).toEqual({ x: 0, y: 0, w: 100, h: 100 }) // bbox는 있다
  })
})

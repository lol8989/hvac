// 천정고(층고) — 층별 입력값과 그것이 부하강도에 주는 영향. 순수 도메인.
//
// 근거: Confluence「실내기·실외기 자동배치 룰」
//   · 3부 확인 항목 — "천정고 / 기본값 3미터 / 화면에서 수정하고 실제 장비들 용량에 일괄적용"
//   · 1부 ① 부하 강도 보정 — "천정고 4.0m 이상(고천장·OPEN) → 특수부하"
//
// 천정고는 실의 속성이 아니라 '층'의 속성이다. 같은 층의 실들은 같은 천정고를 공유한다.
// 그래서 Room에 필드를 더하지 않고 층 → 높이 맵을 따로 두고, 적용 시점에 실의 부하강도로 번역한다.
//
// 천정고가 실내기 선정에 주는 변동은 이 파일이 직접 만들지 않는다. 기존 연쇄를 그대로 탄다:
//   천정고 ≥4m → 부하강도 SPECIAL → 단위부하 상승 → 필요부하 상승
//     → placementRules의 "4kW 이상은 4WAY 기본" 및 부하기준 대수에 걸린다.
//   즉 층고가 높아지면 1WAY/2WAY 자리에 4WAY가 들어갈 수 있다(회의록 0708 요구)는 결과가
//   새 임계값 없이 나온다. 층고 전용 타입 전환 규칙을 따로 만들지 않는 이유다.

import type { LoadIntensity } from '../shared/unitLoadTable'
import type { Room } from './Room'

// 층 → 천정고(m). 값이 없는 층은 기본값을 쓴다(빈 맵 = 전 층 3.0m).
export type CeilingHeights = Readonly<Record<string, number>>

export const DEFAULT_CEILING_HEIGHT_M = 3.0
export const SPECIAL_LOAD_MIN_HEIGHT_M = 4.0

// 입력 가드 범위. 부하 규칙이 아니라 오타 방어값이다(2.4m 주차장 ~ 체육관·공장 고천장).
// 실제로 이 범위를 벗어나는 현장이 있으면 규칙이 아니라 이 상수를 넓힌다.
export const MIN_CEILING_HEIGHT_M = 2.0
export const MAX_CEILING_HEIGHT_M = 20.0

export const heightForFloor = (heights: CeilingHeights, floor: string): number =>
  heights[floor] ?? DEFAULT_CEILING_HEIGHT_M

// 천정고가 정하는 부하강도.
//
// ⚠️ 한계: 문서는 지하층=저부하, 외기 2면 이상=고부하도 규정하지만 그 입력원(층 구분·외기면)이
//    아직 없다. 지금은 천정고가 유일한 강도 결정자이므로 STANDARD로 되돌리는 것이 옳다.
//    다른 보정이 생기면 여기서 반환할 게 아니라 세 신호를 합성하는 함수가 따로 필요하다.
export const intensityForHeight = (heightM: number): LoadIntensity =>
  heightM >= SPECIAL_LOAD_MIN_HEIGHT_M ? 'SPECIAL' : 'STANDARD'

export type ParseResult = { ok: true; value: number } | { ok: false; reason: string }

export const parseCeilingHeight = (raw: string): ParseResult => {
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, reason: '천정고를 입력하세요' }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: '천정고는 0보다 큰 숫자여야 합니다' }
  }
  if (value < MIN_CEILING_HEIGHT_M || value > MAX_CEILING_HEIGHT_M) {
    return { ok: false, reason: `천정고는 ${MIN_CEILING_HEIGHT_M}~${MAX_CEILING_HEIGHT_M}m 범위여야 합니다` }
  }
  return { ok: true, value }
}

// 층별 천정고를 전 실의 부하강도에 일괄 적용한다.
// 사용자가 직접 고친 단위부하는 Room.withIntensity(withAi)가 보존한다 — 수정 셀 보존 정책.
// 바뀐 실이 하나도 없으면 원본 객체를 그대로 돌려준다(불필요한 재렌더·커밋 방지).
export const applyCeilingHeights = (
  rooms: Readonly<Record<string, Room>>,
  heights: CeilingHeights,
): Record<string, Room> => {
  let changed = false
  const next: Record<string, Room> = {}

  for (const [id, room] of Object.entries(rooms)) {
    const intensity = intensityForHeight(heightForFloor(heights, room.floor))
    if (intensity === room.intensity) {
      next[id] = room
      continue
    }
    next[id] = room.withIntensity(intensity)
    changed = true
  }

  return changed ? next : (rooms as Record<string, Room>)
}

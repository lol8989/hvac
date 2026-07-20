// 실명(usage) 해석 — 표기 정규화 + 단위부하 조회 근거. Shared Kernel.
//
// 왜 필요한가: 곧 도면 실명 추출기(개발팀)가 붙는다. 지금 usage는 목업이 넣어준 깨끗한
// 실명이지만, 추출기가 붙으면 도면에서 긁어온 날 텍스트가 들어온다 — '회의실-1',
// '사무실(A동)', '회 의 실', 무명 실. 현재 조회는 숫자만 돌려주므로 호출부가
// "150이라서 150"과 "못 찾아서 150"을 구분할 수 없다. 부하가 통째로 틀려도 화면은 정상으로 보인다.
//
// 그래서 조회에 '근거(matched)'를 붙인다. 사전을 지어 두고 데이터를 기다리는 대신,
// 폴백을 관측 가능하게 만들어 실데이터가 사전을 짓게 한다.
//
// 근거: Confluence「자동배치 룰」 ① "실명이 표에 없으면 동의어 매핑으로 흡수",
//       "매칭이 전혀 안 되면 기본값 150", 한계 "실명이 없거나 무명 공간은 부하가 보수적으로 잡힘".
// 이음매 명세: doc/05_설계결정/실명_추출_연동_명세_v1.md

import {
  lookupUnitLoadKcal,
  resolveUsageAlias,
  hasDirectUsageRow,
  hasUsageRow,
  FALLBACK_KCAL,
  type FacilityType,
  type LoadIntensity,
} from './unitLoadTable'

// 추출기가 '이름을 못 찾음'을 명시적으로 넘길 때 쓰는 표기.
export const UNNAMED_USAGE = '(무명)'

const UNNAMED_TOKENS = new Set([UNNAMED_USAGE, '미상', '미지정', '-'])

export const isUnnamed = (usage: string | null | undefined): boolean => {
  if (usage === null || usage === undefined) return true
  const t = usage.trim()
  return t === '' || UNNAMED_TOKENS.has(t)
}

// 표기 정규화 — 도메인 지식이 아니라 표기 규칙이다(실명을 추정하지 않는다).
//  · 괄호 주석 제거: '사무실(A동)' '사무실 [3층]' → '사무실'
//  · 내부/양끝 공백 접기: '회 의 실' → '회의실'
//  · 번호 접미사 제거: '회의실1' '회의실-2' '회의실 03' → '회의실'
//
// 번호 제거는 남는 게 있을 때만 한다. '101'처럼 숫자뿐인 실명을 빈 문자열로 만들면
// 무명과 구분이 사라진다 — 표에 숫자로 끝나는 실명이 없으므로 손해도 없다.
export function normalizeUsage(usage: string): string {
  const withoutNotes = usage.replace(/[([{（［].*?[)\]}）］]/g, ' ')
  const collapsed = withoutNotes.replace(/\s+/g, '')
  const withoutIndex = collapsed.replace(/[-_]?\d+$/, '')
  return withoutIndex === '' ? collapsed : withoutIndex
}

// 값을 어떤 근거로 얻었는지. exact/normalized/alias는 표에 근거가 있고,
// unknown/unnamed는 150으로 떨어진 것이라 현업 확인이 필요하다 — 조치가 서로 다르다.
//  · unknown : 실명은 있는데 표에 없다   → 동의어 사전에 추가할 후보
//  · unnamed : 실명 자체가 없다          → 도면에 실명을 기입해야 한다
export type UsageMatch = 'exact' | 'normalized' | 'alias' | 'unknown' | 'unnamed'

export interface UnitLoadResolution {
  kcal: number
  matched: UsageMatch
  resolvedUsage: string // 실제로 표에서 찾은 실명(흡수 결과). unknown/unnamed면 입력 그대로.
}

// 근거가 표에 있는가 — 신뢰할 수 있는 값인가.
export const isGrounded = (m: UsageMatch): boolean =>
  m === 'exact' || m === 'normalized' || m === 'alias'

// 해석은 좁은 순서로 시도한다 — 먼저 걸린 근거가 답이다.
// 직접 조회(exact) → 표기 정규화(normalized) → 동의어 흡수(alias) → 없음(unknown).
export function resolveUnitLoadKcal(
  facility: FacilityType,
  usage: string,
  intensity: LoadIntensity = 'STANDARD',
): UnitLoadResolution {
  if (isUnnamed(usage)) {
    return { kcal: FALLBACK_KCAL, matched: 'unnamed', resolvedUsage: usage }
  }

  const found = (matched: UsageMatch, resolvedUsage: string): UnitLoadResolution => ({
    kcal: lookupUnitLoadKcal(facility, resolvedUsage, intensity),
    matched,
    resolvedUsage,
  })

  const trimmed = usage.trim()
  if (hasDirectUsageRow(facility, trimmed)) return found('exact', trimmed)

  const normalized = normalizeUsage(usage)
  if (hasDirectUsageRow(facility, normalized)) return found('normalized', normalized)

  // 동의어는 표에 직접 없을 때만 적용된다(unitLoadTable.rowOf와 같은 정책).
  if (hasUsageRow(facility, normalized)) return found('alias', resolveUsageAlias(normalized))

  // 어디에도 없다 — 사전에 추가할 후보로 남긴다.
  return { kcal: FALLBACK_KCAL, matched: 'unknown', resolvedUsage: usage }
}

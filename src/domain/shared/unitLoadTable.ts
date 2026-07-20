// 용도별 단위부하표 (kcal/h·㎡) — Shared Kernel. 순수 데이터 + 조회 규칙.
//
// 근거: doc/03_데이터/LG전자_단위부하_참고자료.pdf (주인님 제공 2026-07-10)
// Confluence「자동배치 룰」의 표는 이 자료의 Standard 열 요약본이다. 원본이 우선한다.
//
// 두 가지가 중요하다.
//  1) 같은 실명이 시설군마다 값이 다르다(식당: 주거 120 / 상업 210, 로비: 숙박 180 / 종교 150).
//     → 실명만으로는 부하를 정할 수 없다. 시설군이 함께 있어야 한다.
//  2) 표의 빈 칸은 '값 없음'이지 0이 아니다. 그 강도가 없으면 Standard로 떨어진다.
//     연회장·판매장·공장의 특수부하 칸은 숫자가 아니라 주석('예식장'·'대형매장'·'발열기기 별도')이라
//     아예 싣지 않는다(specialNote로 남긴다).

export const FACILITY_TYPES = ['주거시설', 'OFFICE', '종교시설', '상업시설', '숙박시설', '대공간', '개인병원'] as const
export type FacilityType = (typeof FACILITY_TYPES)[number]

export const LOAD_INTENSITIES = ['STANDARD', 'LOW', 'HIGH', 'SPECIAL'] as const
export type LoadIntensity = (typeof LOAD_INTENSITIES)[number]

// 도면 실명이 표에 없을 때의 기본값(Confluence: "매칭이 전혀 안 되면 기본값 150kcal/h·㎡").
export const FALLBACK_KCAL = 150

interface LoadRow {
  standard: number
  low?: number
  high?: number
  special?: number
  specialNote?: string // 특수부하 칸이 숫자가 아닌 주석인 경우
}

const TABLE: Record<FacilityType, Record<string, LoadRow>> = {
  주거시설: {
    거실: { standard: 140, low: 130, high: 150, special: 200 },
    식당: { standard: 120, low: 120, high: 140 },
    주방: { standard: 140, low: 120, high: 170 },
    침실: { standard: 110, low: 100, high: 130 },
    가족실: { standard: 140, low: 120, high: 150 },
    서재: { standard: 110, low: 100, high: 120 },
  },
  OFFICE: {
    사무실: { standard: 150, low: 145, high: 170, special: 200 },
    임원실: { standard: 150, low: 130, high: 150 },
    회의실: { standard: 150, low: 140, high: 170 },
    휴게실: { standard: 150, low: 140, high: 170 },
    관리실: { standard: 150 },
    업무시설: { standard: 180 },
    근생: { standard: 215 },
  },
  종교시설: {
    본당: { standard: 240, low: 200, high: 300, special: 365 },
    소예배실: { standard: 180, low: 150, high: 240 },
    기도실: { standard: 150, low: 140, high: 170 },
    목회실: { standard: 150, low: 140, high: 170 },
    부속실: { standard: 170, low: 140, high: 180 },
    로비: { standard: 150, low: 90, high: 210 }, // 원표 '홀, 로비'
    홀: { standard: 150, low: 90, high: 210 },
    대예배실: { standard: 300, low: 240, high: 365 },
    교회사무실: { standard: 150, low: 120, high: 170 },
  },
  상업시설: {
    식당: { standard: 210, low: 180, high: 300, special: 365 },
    근린시설: { standard: 180, low: 150, high: 240 },
    이발소: { standard: 150, low: 140, high: 170 },
    호프집: { standard: 200, low: 180, high: 240 },
    '아파트형 공장': { standard: 180, low: 170, high: 230 },
  },
  숙박시설: {
    객실: { standard: 110, low: 100, high: 130 },
    로비: { standard: 180, low: 170, high: 245, special: 300 },
    커피숍: { standard: 180, low: 170, high: 245 },
    세미나실: { standard: 180, low: 150, high: 245 },
  },
  대공간: {
    극장: { standard: 300, low: 240, high: 425 },
    헬스장: { standard: 240, low: 180, high: 365 },
    연회장: { standard: 300, low: 240, high: 425, specialNote: '예식장' },
    체육관: { standard: 240, low: 180, high: 365 },
    판매장: { standard: 300, low: 240, high: 455, specialNote: '대형매장' },
    은행: { standard: 180, low: 170, high: 215 },
    공장: { standard: 300, low: 240, high: 455, specialNote: '발열기기 별도' },
    탈의실: { standard: 150, low: 140 },
    '에어로빅/헬스': { standard: 180, low: 170, high: 200 },
  },
  개인병원: {
    병실: { standard: 140, low: 130, high: 170 },
    수술실: { standard: 180, low: 150, high: 210 },
    물리치료실: { standard: 180, low: 170, high: 240, special: 300 },
    원장실: { standard: 140, low: 130, high: 170 },
    로비: { standard: 180, low: 150, high: 240 },
    방사선실: { standard: 150, low: 140, high: 170 },
  },
}

// 도면 실명 → 표준 실명. 근거: Confluence「자동배치 룰」 ①.
const ALIASES: Record<string, string> = {
  강당: '회의실',
  세미나: '회의실',
  세미나실: '회의실',
  미술실: '업무시설',
  교실: '업무시설',
  창고: '관리실',
}

const norm = (s: string): string => s.trim()

export function resolveUsageAlias(usage: string): string {
  return ALIASES[norm(usage)] ?? norm(usage)
}

const COLUMN: Record<LoadIntensity, keyof Pick<LoadRow, 'standard' | 'low' | 'high' | 'special'>> = {
  STANDARD: 'standard',
  LOW: 'low',
  HIGH: 'high',
  SPECIAL: 'special',
}

// 동의어는 '표에 없을 때만' 적용한다.
// 예: '세미나실'은 숙박시설 표에 180으로 실재한다 — 이를 회의실(150)로 바꾸면 원표 값을 잃는다.
function rowOf(facility: FacilityType, usage: string): LoadRow | undefined {
  const rows = TABLE[facility]
  if (!rows) return undefined
  return rows[norm(usage)] ?? rows[resolveUsageAlias(usage)]
}

// 표에 그 실명이 실재하는가. lookupUnitLoadKcal의 반환값으로는 판별할 수 없다 —
// '관리실'의 standard가 150이라 '못 찾아서 150'과 숫자가 같기 때문이다(usageResolution이 요구).
export function hasDirectUsageRow(facility: FacilityType, usage: string): boolean {
  return TABLE[facility]?.[norm(usage)] !== undefined
}

// 동의어까지 흡수해서 찾히는가.
export function hasUsageRow(facility: FacilityType, usage: string): boolean {
  return rowOf(facility, usage) !== undefined
}

// 표에 그 강도 칸이 없으면 Standard로 떨어진다. 실명이 아예 없으면 FALLBACK_KCAL.
export function lookupUnitLoadKcal(facility: FacilityType, usage: string, intensity: LoadIntensity = 'STANDARD'): number {
  const row = rowOf(facility, usage)
  if (!row) return FALLBACK_KCAL
  return row[COLUMN[intensity]] ?? row.standard
}

// 특수부하 칸이 주석인 행의 안내 문구(예: 판매장 → '대형매장'). 없으면 null.
export function specialNoteOf(facility: FacilityType, usage: string): string | null {
  return rowOf(facility, usage)?.specialNote ?? null
}

// 사용자가 단위부하를 직접 고칠 때 '적정 수치'인지 판정하는 근거 범위(kcal/h·㎡).
// 그 실명·시설군에 표가 정의한 강도 칸(표준/저/고/특수)의 최소~최대. AI 기본값은 이 표에서
// 나오므로 항상 범위 안이고, 벗어날 수 있는 것은 사용자 오버라이드뿐이다.
// 표에 없는 실명(FALLBACK로 떨어지는 실)은 근거가 없어 null — 이때는 적정 여부를 판정하지 않는다.
export function reasonableUnitLoadKcalRange(
  facility: FacilityType,
  usage: string,
): { min: number; max: number } | null {
  const row = rowOf(facility, usage)
  if (!row) return null
  const vals = [row.standard, row.low, row.high, row.special].filter(
    (v): v is number => typeof v === 'number',
  )
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

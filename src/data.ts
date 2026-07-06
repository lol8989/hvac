// 목업 데이터 (장비일람표 기반). 실제 서비스에서는 장비마스터 API에서 로드.

import type { EnergySourceCode } from './domain/shared/EnergySource'

export interface Room {
  name: string
  area: number
  type: string
  cool: number
  sys: EnergySourceCode
  x: number
  y: number
  w: number
  h: number
}

export const ROOMS: Record<string, Room> = {
  AC_001: { name: '거실', area: 31.89, type: '4WAY', cool: 11.2, sys: 'EHP', x: 24, y: 24, w: 250, h: 150 },
  AC_002: { name: '침실1', area: 18.5, type: '1WAY', cool: 5.6, sys: 'EHP', x: 292, y: 24, w: 180, h: 110 },
  AC_003: { name: '회의실', area: 28.5, type: '4WAY', cool: 9.0, sys: 'EHP', x: 490, y: 24, w: 206, h: 150 },
  AC_004: { name: '사무실', area: 42.0, type: '4WAY', cool: 14.0, sys: 'EHP', x: 24, y: 196, w: 250, h: 150 },
  AC_005: { name: '로비', area: 55.0, type: '4WAY', cool: 22.4, sys: 'EHP', x: 292, y: 152, w: 180, h: 194 },
  AC_006: { name: '탕비실', area: 12.0, type: '1WAY', cool: 4.5, sys: 'EHP', x: 490, y: 196, w: 206, h: 150 },
}

// 실외기 스펙 카탈로그 항목. 장비마스터(Equipment Master)가 게시(PUBLISHED)하는
// 실외기 모델 스펙의 단일 진실 공급원(SSOT) 목업.
//   maxConn = 최대 연결 실내기 수. priceKrw/등급/COP = 게시 스펙(숫자 SSOT).
//   ⚠️ 단가·등급·COP는 POC 플레이스홀더 값(미확정, 실데이터 교체 예정).
//   실측 앵커: RPUW12BX9M/RPUW20BX9P/RPUQ141X9S(MODELS.out 기준), 나머지는 용량 스케일 보간.
export interface OduCatalogEntry {
  model: string
  cat: string
  sys: EnergySourceCode
  cool: number
  maxConn: number
  priceKrw: number // VAT별도 소비자가(정수 원)
  priceTypeCode: string
  priceWithVatKrw: number | null // 미상은 null
  effectiveStartDate: string // yyyy-mm-dd
  priority: number
  efficiencyGradeId: number | null // 에너지소비효율등급(1~5). 미부여 시 null
  copCooling: number | null // 냉방 효율비(mock EERa 상당)
  copHeating: number | null // 난방 효율비
}

// 실외기 배치 레이아웃 (어떤 모델을 어느 실외기 위치에 두고 어떤 실내기를 연결하는가).
// 스펙(계열·용량·최대연결수)은 카탈로그(ODU_CATALOG)를 모델로 조회한다 — 중복 금지.
export interface InitialGroup {
  key: string
  label: string
  model: string
  items: string[]
}

export const INITIAL_GROUPS: InitialGroup[] = [
  { key: 'ODU1', label: '실외기-1', model: 'RPUW12BX9M', items: ['AC_001', 'AC_003', 'AC_006'] },
  { key: 'ODU2', label: '실외기-2', model: 'RPUW20BX9P', items: ['AC_004', 'AC_005'] },
  { key: 'ODU3', label: '실외기-3', model: 'GPUW280C2S', items: [] },
]

export const INITIAL_POOL: string[] = ['AC_002']

// 장비마스터 PUBLISHED 실외기 스펙 (SSOT). 단가/등급/COP는 POC 플레이스홀더(미확정).
const D = '2026-04-20' // effectiveStartDate 공통(목업)
export const ODU_CATALOG: OduCatalogEntry[] = [
  { model: 'RPUW08BX9E', cat: '냉난방 절환형', sys: 'EHP', cool: 22.4, maxConn: 13, priceKrw: 2980000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 3278000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 2, copCooling: 5.1, copHeating: 4.3 },
  { model: 'RPUW12BX9M', cat: '냉난방 절환형', sys: 'EHP', cool: 34.8, maxConn: 20, priceKrw: 4120000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 4532000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 3, copCooling: 4.99, copHeating: 4.2 },
  { model: 'RPUW16BX9M', cat: '냉난방 절환형', sys: 'EHP', cool: 45.0, maxConn: 26, priceKrw: 5240000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 5764000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 3, copCooling: 4.8, copHeating: 4.05 },
  { model: 'RPUW20BX9P', cat: '냉난방 절환형', sys: 'EHP', cool: 57.0, maxConn: 33, priceKrw: 6350000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 6985000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 3, copCooling: 4.99, copHeating: 4.1 },
  { model: 'RPUQ141X9S', cat: '냉방전용', sys: 'EHP', cool: 39.2, maxConn: 23, priceKrw: 3760000, priceTypeCode: 'CONSUMER', priceWithVatKrw: null, effectiveStartDate: D, priority: 10, efficiencyGradeId: null, copCooling: 4.0, copHeating: null },
  { model: 'GPUW280C2S', cat: 'GHP', sys: 'GHP', cool: 28.0, maxConn: 16, priceKrw: 8900000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 9790000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 4, copCooling: 1.55, copHeating: 1.45 },
  { model: 'GPUW450C2S', cat: 'GHP', sys: 'GHP', cool: 45.0, maxConn: 26, priceKrw: 12400000, priceTypeCode: 'CONSUMER', priceWithVatKrw: null, effectiveStartDate: D, priority: 10, efficiencyGradeId: 4, copCooling: 1.5, copHeating: 1.4 },
]

export interface ModelCard {
  mn: string
  ms: string
  mp: string
  md: string
  on: boolean
  cool?: number // 실내기 냉방용량(kW) — 실 부하 근사 매칭에 사용. 실외기 카드는 미사용.
  kind?: string // 실내기 유형(벽걸이형 / 4WAY 등) — 도면 심볼 태그 표시용.
}

export const MODELS: { in: ModelCard[]; out: ModelCard[] } = {
  in: [
    { mn: 'LG AMNW09GTRA0', ms: '벽걸이형 · 냉방 2.64kW · 난방 3.30kW · 1등급', mp: '642,900원', md: '적용 2026.07.08', on: true, cool: 2.64, kind: '벽걸이형' },
    { mn: 'R-W0401A2U', ms: '4WAY 카세트 · 냉방 4.0kW · 난방 4.5kW', mp: '660,000원', md: '적용 2026.04.20', on: false, cool: 4.0, kind: '4WAY' },
    { mn: 'R-W0601A2U', ms: '4WAY 카세트 · 냉방 6.0kW · 난방 6.8kW', mp: '780,000원', md: '적용 2026.04.20', on: false, cool: 6.0, kind: '4WAY' },
    { mn: 'R-W0901A2U', ms: '4WAY 카세트 · 냉방 9.0kW · 난방 10.0kW', mp: '980,000원', md: '적용 2026.04.20', on: false, cool: 9.0, kind: '4WAY' },
    { mn: 'R-W1401A2U', ms: '4WAY 카세트 · 냉방 14.0kW · 난방 16.0kW', mp: '1,340,000원', md: '적용 2026.04.20', on: false, cool: 14.0, kind: '4WAY' },
    { mn: 'R-W2201A2U', ms: '4WAY 카세트 · 냉방 22.4kW · 난방 25.0kW', mp: '1,920,000원', md: '적용 2026.04.20', on: false, cool: 22.4, kind: '4WAY' },
  ],
  out: [
    { mn: 'RPUW12BX9M', ms: '냉난방 절환형 · 냉방 34.8kW · EERa 4.99 · 3등급', mp: '4,120,000원', md: '적용 2026.04.20', on: true },
    { mn: 'RPUW20BX9P', ms: '냉난방 절환형 · 냉방 57.0kW · EERa 4.99 · 3등급', mp: '6,350,000원', md: '적용 2026.04.20', on: false },
    { mn: 'RPUQ141X9S', ms: '냉방전용 · 냉방 39.2kW · EER 4.00', mp: '3,760,000원', md: '적용 2026.02.20', on: false },
  ],
}

// 조합비 = 연결 실내기 냉방용량 합 / 실외기 용량.
// capByRoom(실별 실내기 정격용량 맵)을 주면 그 값으로 합산(B: 선택 장비 기준),
// 없으면 방 부하(ROOMS.cool)를 프록시로 사용(하위 호환).
export const ratioOf = (
  group: { items: string[]; cool: number },
  capByRoom?: Record<string, number>,
): number => {
  const capOf = (id: string) => (capByRoom ? capByRoom[id] ?? 0 : ROOMS[id]?.cool || 0)
  const sum = group.items.reduce((a, id) => a + capOf(id), 0)
  return group.cool ? sum / group.cool : 0
}

// 실내기 모델명 → 정격 냉방용량(kW). 미매칭/미지정은 0.
export const indoorCoolByModel = (model: string | undefined): number =>
  (model ? MODELS.in.find((m) => m.mn === model)?.cool : undefined) ?? 0

export const groupOfRoom = <T extends { items: string[] }>(groups: T[], roomId: string): T | null =>
  groups.find((g) => g.items.includes(roomId)) || null

// 실 냉방부하(kW)에 가장 가까운 용량의 실내기 카드 인덱스(근사 매칭). 동률이면 더 큰 용량 우선.
export const recommendedIndoorIdx = (coolKw: number, cards: ModelCard[] = MODELS.in): number => {
  let best = 0
  let bestDiff = Infinity
  cards.forEach((c, i) => {
    const cap = c.cool ?? 0
    const diff = Math.abs(cap - coolKw)
    if (diff < bestDiff || (diff === bestDiff && cap > (cards[best].cool ?? 0))) {
      best = i
      bestDiff = diff
    }
  })
  return best
}

// 실외기 모델 코드로 실외기 카드 인덱스 조회(선택 실이 속한 그룹의 실외기 하이라이트용). 없으면 -1.
export const outdoorIdxByModel = (model: string, cards: ModelCard[] = MODELS.out): number =>
  cards.findIndex((c) => c.mn === model)

// 실의 실내기 카드 해석: 적용 모델(appliedModel)이 있으면 그 카드, 없으면 부하 근사 추천.
// App/패널/뷰어가 동일 규칙(모델명·유형)을 공유하는 단일 소스.
export const resolveIndoorCard = (coolKw: number, appliedModel?: string): ModelCard => {
  if (appliedModel) {
    const found = MODELS.in.find((m) => m.mn === appliedModel)
    if (found) return found
  }
  return MODELS.in[recommendedIndoorIdx(coolKw)]
}

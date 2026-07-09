// 목업 데이터 (장비일람표 기반). 실제 서비스에서는 장비마스터 API에서 로드.

import type { EnergySourceCode } from './domain/shared/EnergySource'
import { DEFAULT_UNIT_LOADS } from './domain/shared/UnitLoad'

export interface Room {
  name: string
  floor: string // 층 (예: '지상1층')
  usage: string // 용도 (단위부하 조회 키 — DEFAULT_UNIT_LOADS)
  area: number
  type: string
  cool: number
  sys: EnergySourceCode
  x: number
  y: number
  w: number
  h: number
}

// 부하 = 면적 × 용도별 단위부하 × 1.163 (장비선정표 엑셀 산식). kW, 0.1 단위 반올림.
const roomCoolKw = (areaM2: number, usage: string): number =>
  Math.round((areaM2 * DEFAULT_UNIT_LOADS[usage].cool * 1.163) / 100) / 10

// 로그인 사용자·GNB 메뉴 목업 (실서비스: 인증/세션 API에서 로드)
export interface CurrentUser {
  team: string
  name: string
  email: string
}
export const CURRENT_USER: CurrentUser = { team: '영업1팀', name: '홍길동', email: 'hong@lg.com' }
export const GNB_MENUS: readonly string[] = ['대시보드', '검도', '생성']
export const ACTIVE_MENU = '생성'

// cool은 하드코딩이 아닌 산식 파생값 (거실 6.3 / 침실1 3.2 / 회의실 5.6 / 사무실 8.8 / 로비 11.5 / 탕비실 2.1)
export const ROOMS: Record<string, Room> = {
  AC_001: { name: '거실', floor: '지상1층', usage: '거실', area: 31.89, type: '4WAY', cool: roomCoolKw(31.89, '거실'), sys: 'EHP', x: 24, y: 24, w: 250, h: 150 },
  AC_002: { name: '침실1', floor: '지상1층', usage: '침실', area: 18.5, type: '1WAY', cool: roomCoolKw(18.5, '침실'), sys: 'EHP', x: 292, y: 24, w: 180, h: 110 },
  AC_003: { name: '회의실', floor: '지상1층', usage: '회의실', area: 28.5, type: '4WAY', cool: roomCoolKw(28.5, '회의실'), sys: 'EHP', x: 490, y: 24, w: 206, h: 150 },
  AC_004: { name: '사무실', floor: '지상1층', usage: '사무실', area: 42.0, type: '4WAY', cool: roomCoolKw(42.0, '사무실'), sys: 'EHP', x: 24, y: 196, w: 250, h: 150 },
  AC_005: { name: '로비', floor: '지상1층', usage: '로비', area: 55.0, type: '4WAY', cool: roomCoolKw(55.0, '로비'), sys: 'EHP', x: 292, y: 152, w: 180, h: 194 },
  AC_006: { name: '탕비실', floor: '지상1층', usage: '탕비실', area: 12.0, type: '1WAY', cool: roomCoolKw(12.0, '탕비실'), sys: 'EHP', x: 490, y: 196, w: 206, h: 150 },
}

// 실외기 배치 레이아웃 (어떤 모델을 어느 실외기 위치에 두고 어떤 실내기를 연결하는가).
// 실외기 스펙(계열·용량·최대연결수·단가 등)의 SSOT는 장비마스터(Equipment Master)이며,
// 생성 단은 OutdoorModelCatalog 포트로 PUBLISHED 스펙만 참조한다(모델 코드로 조회 — CLAUDE.md §1).
export interface InitialGroup {
  key: string
  label: string
  model: string
  items: string[]
}

// 초기 상태는 "빈/0" — 실외기 그룹(모델)만 제안하고 실내기는 사전배정하지 않는다.
// 배정은 파이프라인 진행(검출→배치→조합)의 결과로만 생긴다(NEXT #2·#3, CLAUDE.md §1).
export const INITIAL_GROUPS: InitialGroup[] = [
  { key: 'ODU1', label: '실외기-1', model: 'RPUW08BX9E', items: [] },
  { key: 'ODU2', label: '실외기-2', model: 'RPUW12BX9M', items: [] },
  { key: 'ODU3', label: '실외기-3', model: 'GPUW280C2S', items: [] },
]

// 초기 미배정 풀도 비어 있다(하드코딩 상수 제거). 실은 실내기 배치 후 풀에 편입된다.
export const INITIAL_POOL: string[] = []

// combine 단계 진입 시 적용하는 '자동 조합' 기본 매핑(실→실외기 그룹).
// 사용자가 이후 매핑 팝업에서 조정한다. 전 실을 계열 호환 그룹에 배정(미배정 0).
//  · ODU1(RPUW08BX9E, EHP 22.4kW): 거실·회의실·탕비실 (설계부하 합 ≈14.0 → 조합비 ≈0.63)
//  · ODU2(RPUW12BX9M, EHP 34.8kW): 사무실·로비·침실1 (설계부하 합 ≈23.5 → 조합비 ≈0.68)
//  · ODU3(GPUW280C2S, GHP): 빈 상태(EHP 실과 계열 불일치라 배정 없음)
export interface Combination {
  key: string
  items: string[]
}
export const DEFAULT_COMBINATION: Combination[] = [
  { key: 'ODU1', items: ['AC_001', 'AC_003', 'AC_006'] },
  { key: 'ODU2', items: ['AC_004', 'AC_005', 'AC_002'] },
  { key: 'ODU3', items: [] },
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

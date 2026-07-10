// 목업 데이터 (장비일람표 기반). 실제 서비스에서는 장비마스터 API에서 로드.

import type { Principal } from './domain/auth/Permission'
import type { EnergySourceCode } from './domain/shared/EnergySource'
import { lookupUnitLoadKcal, type FacilityType } from './domain/shared/unitLoadTable'

export interface Room {
  name: string
  floor: string // 층 (예: '지상1층')
  usage: string // 용도 (단위부하 조회 키)
  area: number
  // 실측 폭·길이(m). 실내기 타입 결정(짧은 폭 경계)과 확산범위 대수 계산이 요구한다.
  // 목업 도면은 SVG 픽셀만 가지므로 면적과 정합되게 환산한다(scale = √(area / (w·h))).
  shortSideM: number
  longSideM: number
  corridor?: boolean // 복도는 '4kW 이상 4WAY 기본' 규칙에서 제외된다
  type: string
  cool: number
  sys: EnergySourceCode
  x: number
  y: number
  w: number
  h: number
}

// 부하 = 면적 × 시설군·용도별 단위부하 × 1.163. kW, 0.1 단위 반올림.
// 근거: doc/03_데이터/LG전자_단위부하_참고자료.pdf (Confluence: 면적 × 단위부하 ÷ 860 과 동일)
const roomCoolKw = (areaM2: number, facility: FacilityType, usage: string): number =>
  Math.round((areaM2 * lookupUnitLoadKcal(facility, usage) * 1.163) / 100) / 10

// SVG 픽셀 박스 → 실측 변 길이(m). 면적을 보존하도록 등비 축척한다.
const sidesM = (areaM2: number, wPx: number, hPx: number): { shortSideM: number; longSideM: number } => {
  const scale = Math.sqrt(areaM2 / (wPx * hPx))
  const a = wPx * scale
  const b = hPx * scale
  return { shortSideM: Math.min(a, b), longSideM: Math.max(a, b) }
}

// 로그인 사용자·GNB 메뉴 목업 (실서비스: 인증/세션 API에서 로드)
//
// 권한(role)은 로그인이 붙기 전까지 하드코딩이다(주인님 지시 2026-07-10).
// 인증이 생기면 이 상수만 세션에서 만든 Principal로 바꾸면 되고,
// 권한 규칙(domain/auth/Permission.ts)과 화면 분기는 그대로 남는다.
// 일반 사용자 화면을 확인하려면 role을 'USER'로 바꾼다.
export interface CurrentUser extends Principal {
  team: string
  name: string
  email: string
}
export const CURRENT_USER: CurrentUser = { team: '영업1팀', name: '홍길동', email: 'hong@lg.com', role: 'ADMIN' }
export const GNB_MENUS: readonly string[] = ['대시보드', '검도', '생성']
export const ACTIVE_MENU = '생성'

// 시설군은 프로젝트 설정이다(생성 첫 화면에서 선택 — 주인님 지시 2026-07-10).
// 목업 도면은 사무 건물이라 기본값 OFFICE. 표에 없는 실(거실·침실·로비·탕비실)은 기본 150kcal로 떨어진다.
export const DEFAULT_FACILITY: FacilityType = 'OFFICE'

// cool은 하드코딩이 아닌 산식 파생값(프로젝트 기본 시설군 기준). 사용자가 시설군을 바꾸면 도메인 Room이 다시 계산한다.
export const ROOMS: Record<string, Room> = {
  AC_001: { name: '거실', floor: '지상1층', usage: '거실', area: 31.89, type: '4WAY', cool: roomCoolKw(31.89, DEFAULT_FACILITY, '거실'), ...sidesM(31.89, 250, 150), sys: 'EHP', x: 24, y: 24, w: 250, h: 150 },
  AC_002: { name: '침실1', floor: '지상1층', usage: '침실', area: 18.5, type: '1WAY', cool: roomCoolKw(18.5, DEFAULT_FACILITY, '침실'), ...sidesM(18.5, 180, 110), sys: 'EHP', x: 292, y: 24, w: 180, h: 110 },
  AC_003: { name: '회의실', floor: '지상1층', usage: '회의실', area: 28.5, type: '4WAY', cool: roomCoolKw(28.5, DEFAULT_FACILITY, '회의실'), ...sidesM(28.5, 206, 150), sys: 'EHP', x: 490, y: 24, w: 206, h: 150 },
  AC_004: { name: '사무실', floor: '지상1층', usage: '사무실', area: 42.0, type: '4WAY', cool: roomCoolKw(42.0, DEFAULT_FACILITY, '사무실'), ...sidesM(42.0, 250, 150), sys: 'EHP', x: 24, y: 196, w: 250, h: 150 },
  AC_005: { name: '로비', floor: '지상1층', usage: '로비', area: 55.0, type: '4WAY', cool: roomCoolKw(55.0, DEFAULT_FACILITY, '로비'), ...sidesM(55.0, 180, 194), sys: 'EHP', x: 292, y: 152, w: 180, h: 194 },
  AC_006: { name: '탕비실', floor: '지상1층', usage: '탕비실', area: 12.0, type: '1WAY', cool: roomCoolKw(12.0, DEFAULT_FACILITY, '탕비실'), ...sidesM(12.0, 206, 150), sys: 'EHP', x: 490, y: 196, w: 206, h: 150 },
}

// 실외기 그룹은 상수가 아니다 — 실내기 배치가 끝난 뒤 정격 총용량으로 선정한다
// (domain/generation/selectOutdoorUnits). 예전 INITIAL_GROUPS·DEFAULT_COMBINATION은
// 목업 6실에 손으로 맞춘 배열이라 실 검출 결과가 달라지면 무의미했다.

export interface ModelCard {
  mn: string
  ms: string
  md: string
  on: boolean
  cool?: number // 실내기 냉방용량(kW) — 실 부하 근사 매칭에 사용. 실외기 카드는 미사용.
  kind?: string // 실내기 유형(벽걸이형 / 4WAY 등) · 실외기 제품군(냉난방 절환형 등) — 필터·심볼 태그용.
  sys?: string // 계열(EHP / GHP / 수냉식 …) — 실외기 카드 필터용.
  heat?: number | null // 난방용량(kW). null = 냉방전용 — 실외기 냉난방 구분 필터용.
  series?: string // 시리즈명 — 카드 표기 + 시리즈 필터용.
}

export const MODELS: { in: ModelCard[]; out: ModelCard[] } = {
  in: [
    { mn: 'LG AMNW09GTRA0', ms: '벽걸이형 · 냉방 2.64kW · 난방 3.30kW · 1등급', md: '적용 2026.07.08', on: true, cool: 2.64, kind: '벽걸이형' },
    { mn: 'R-W0401A2U', ms: '4WAY 카세트 · 냉방 4.0kW · 난방 4.5kW', md: '적용 2026.04.20', on: false, cool: 4.0, kind: '4WAY' },
    { mn: 'R-W0601A2U', ms: '4WAY 카세트 · 냉방 6.0kW · 난방 6.8kW', md: '적용 2026.04.20', on: false, cool: 6.0, kind: '4WAY' },
    { mn: 'R-W0901A2U', ms: '4WAY 카세트 · 냉방 9.0kW · 난방 10.0kW', md: '적용 2026.04.20', on: false, cool: 9.0, kind: '4WAY' },
    { mn: 'R-W1401A2U', ms: '4WAY 카세트 · 냉방 14.0kW · 난방 16.0kW', md: '적용 2026.04.20', on: false, cool: 14.0, kind: '4WAY' },
    { mn: 'R-W2201A2U', ms: '4WAY 카세트 · 냉방 22.4kW · 난방 25.0kW', md: '적용 2026.04.20', on: false, cool: 22.4, kind: '4WAY' },
  ],
  out: [
    { mn: 'RPUW12BX9M', ms: '냉난방 절환형 · 냉방 34.8kW · EERa 4.99 · 3등급', md: '적용 2026.04.20', on: true },
    { mn: 'RPUW20BX9P', ms: '냉난방 절환형 · 냉방 57.0kW · EERa 4.99 · 3등급', md: '적용 2026.04.20', on: false },
    { mn: 'RPUQ141X9S', ms: '냉방전용 · 냉방 39.2kW · EER 4.00', md: '적용 2026.02.20', on: false },
  ],
}

// 조합비는 도메인이 계산한다 — OutdoorGroup.comboRatio() (설치 정격용량 합 ÷ 실외기 용량).
// 프리젠테이션에서 다시 세지 않는다: 예전 ratioOf는 도메인과 다른 값(설계부하 기준)을 내
// 리포트·매핑 팝업·선정표의 조합비가 서로 어긋났다. GroupView.ratio/judgement를 쓴다.

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

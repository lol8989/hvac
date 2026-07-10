// 롱테일 스펙(product_specs) 조회 — 순수 도메인.
//
// 같은 의미인데 라벨이 계열마다 다르다. 실측(1,206모델 전수):
//   액관: '냉매 연결 배관경 > 액관'(685) / '배관경 > 액관'(183) / '냉매 배관 연결부 > 액관'(124) …
//   본체중량: '제품중량 > 본체중량'(898) / '제품 중량 > 본체 중량'(232) …
// 그래서 '표준 키' 하나로 찾을 수 없다. 의미마다 후보 키를 순서대로 훑는다.
//
// 별칭 사전 테이블(spec_label_aliases)을 두는 방법도 있으나(P3-후속), 조회 대상이
// 일람표 컬럼 수십 개로 한정되므로 상수 배열이 더 단순하고 검증하기 쉽다.
// 근거: doc/05_설계결정/일람표_컬럼_매핑표.md §4-(1)

import type { SpecCell } from './SpecImport'

export type SpecData = Record<string, SpecCell>

// 공백·구분자 변종을 흡수한다: '제품 중량 > 본체 중량' ≡ '제품중량>본체중량'
const norm = (key: string): string => key.replace(/\s+/g, '').replace(/[×xX]/g, 'x')

const blank = (v: string | null | undefined): boolean => v == null || v.trim() === '' || v.trim() === '-'

// 후보 키를 순서대로 훑어 첫 번째로 맞는 셀을 낸다. 없으면 null.
// 단위(unit)가 필요한 컬럼이 있다 — 실내기 소비전력은 W, 실외기는 kW로 저장돼 있다.
export function specCell(spec: SpecData, candidates: readonly string[]): SpecCell | null {
  const index = new Map<string, string>()
  for (const k of Object.keys(spec)) index.set(norm(k), k)

  for (const c of candidates) {
    const hit = index.get(norm(c))
    if (hit === undefined) continue
    const cell = spec[hit]
    if (cell && !blank(cell.value)) return cell
  }
  return null
}

// 값만 필요할 때. 없으면 null(값을 지어내지 않는다).
export function specValue(spec: SpecData, candidates: readonly string[]): string | null {
  return specCell(spec, candidates)?.value ?? null
}

// 일람표가 쓰는 의미별 후보 키. 앞쪽이 우선이다(빈도순).
export const SPEC_KEYS = {
  // '전 원'처럼 공백이 낀 라벨도 norm이 흡수한다.
  전원: ['전원 > Case 1', '전원', '전원 > #1', '전원 > Case 1 (V, Phase, Hz)'],

  // 'TA Multi V Super 5' 시트는 '전 력 > 통합냉방소비전력'처럼 접두가 다르다.
  소비전력_냉방: ['소비전력(냉방) > 정격', '소비전력(실내기) > 강/중/약', '소비전력 > 강/중/약', '전력 > 통합냉방소비전력', '소비전력(냉방) > 통합냉방소비전력'],
  소비전력_난방: ['소비전력(난방) > 정격', '전력 > 통합난방소비전력', '소비전력(난방) > 통합난방소비전력'],

  운전전류_냉방: ['운전전류(냉방) > 정격', '전기특성치 > 실내기 팬모터 FLA', '전기특성치 > 팬모터 FLA'],
  운전전류_난방: ['운전전류(난방) > 정격'],

  풍량: ['실내 송풍기 > 풍량((파워)/강/중/약)', '실외 송풍기 > 풍량(High)', '송풍기 > 풍량', '실외 송풍기 > 풍량(최대)'],
  기외정압: ['실내 송풍기 > 기외정압(공장 출하)', '송풍기 > 표준모드 기외정압', '송풍기 > 기외정압 범위'],
  팬정격출력: ['실내 팬모터 > 정격출력', '실외 팬모터 > 정격출력', '팬모터 > 정격출력'],

  본체중량: ['제품중량 > 본체중량', '제품 중량 > 본체 중량'],
  본체치수: ['제품치수 > 본체치수(W x H x D)', '제품 치수 > 본체 치수(W × H × D)'],

  액관: ['냉매 연결 배관경 > 액관', '배관경 > 냉매 액관', '배관경 > 액관', '냉매 배관 연결부 > 액관', '냉매 배관경 > 액관'],
  가스관: ['냉매 연결 배관경 > 가스관', '배관경 > 냉매 가스관', '배관경 > 가스관', '냉매 배관 연결부 > 가스관', '냉매 배관경 > 가스관'],
  드레인: ['드레인(드레인 펌프) > 외경 / 내경', '드레인(자연 배수) > 외경 / 내경'],

  통신선: ['연결전선 > 통신선(VCTF-SB)', '연결 전선 > 통신선( VCTF - SB)', '연결전선 > 전원/통신선(H07RN-F,접지포함)'],
  전원선: ['연결전선 > 전원선(H07RN-F, 접지포함)', '연결 전선 > 전원선( H07RN-F, 접지포함)', '연결전선 > 전원선(H07RN-F,접지포함)', '연결전선 > 주 전원선(H07RN-F,접지포함)'],
  // 일부 시트는 접두 없이 최상위에 둔다.
  차단기: ['전기특성치 > 차단기(ELCB)', '차단기(ELCB)'],

  냉매명: ['냉매 > 냉매명', '냉매 > 종류'],

  // GHP 전용
  가스종: ['사용연료 > 가스종'],
  압축기형식: ['압축기 > 형식'],
  엔진출력: ['엔진 > 정격출력'],
  엔진회전수: ['엔진 > 회전 속도 범위'],
  오일소모량: ['냉각수펌프 > 소비전력'],
  오일량: ['엔진냉각수 > 냉각수 봉입량'],
  엔진가스배관: ['배관경 > 연료 가스 배관'],
  배기드레인: ['배관경 > 배기 드레인 배관'],
} as const satisfies Record<string, readonly string[]>

// 실내기↔실외기 조합 확인표 — 현업(고객사) 확정본.
// 출처: doc/실내기_실외기_조합_확인표_260716_현업회신.xlsx (2026-07-16 현업 회신).
//   · 행 = 실외기 시리즈(35), 열 = 실내기 중분류+시리즈(39).
//   · 값 O = 연결 가능, X = 불가, '-' = 멀티 조합 대상 아님(단품·칠러 등), D = 전용 제품(전용 실내기만).
//   · 격자는 우리가 시드로 채운 가정을 현업이 '수용'한 것이다(비고란 X 사유 0건). 질문 5건은 doc의 질문 시트 참조.
// 주의: 이 파일은 '기준데이터(무엇이 물리적으로 연결 가능한가)'다. 실제 조합(어떤 실내기를 어느 실외기에
//   묶을지)·조합비는 생성(Generation) 단이 이 표를 참조해 판단한다(CLAUDE.md §1). 냉매 종류(R32/R410A)는
//   조합을 가르지 않는다(현업 질문 1: 냉매가 달라도 실내기 공용). FCU는 물 기반이라 생성 실내기 풀에서 제외된다
//   (질문 2, src/domain/generation/indoorCombinability.ts).

// 값 타입(CompatValue = 'O'|'X'|'-'|'D')의 SSOT는 도메인 domain/equipment/CompatMatrix.ts다.
// 시드는 values를 문자열로만 담는다(한 칸당 한 글자).

export interface CompatIndoorColumn {
  subcategory: string // 실내기 중분류 (예: '4WAY 카세트')
  series: string // 실내기 시리즈 (예: 'Multi V 실내기(민수전용)')
  energySource: string
}

export interface CompatOutdoorRow {
  energySource: string
  subcategory: string // 실외기 중분류 (예: '냉난방 절환형')
  series: string // 실외기 시리즈 (예: 'Multi V Super 5(고급형)')
  values: string // 열 순서대로 한 칸당 한 글자(O/X/-/D)
}

export const COMPAT_INDOOR_COLUMNS: readonly CompatIndoorColumn[] = [
  {
    "subcategory": "시스템보일러(AWHP)",
    "series": "AWHP 싱글 시스템보일러",
    "energySource": "AWHP"
  },
  {
    "subcategory": "1WAY 카세트",
    "series": "MULTI (ALL in 1)",
    "energySource": "EHP"
  },
  {
    "subcategory": "1WAY 카세트",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "1WAY 카세트",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "1WAY 카세트",
    "series": "Multi V 실내기(큐레이션)",
    "energySource": "EHP"
  },
  {
    "subcategory": "2WAY 카세트",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "2WAY 카세트",
    "series": "Multi V 실내기(큐레이션)",
    "energySource": "EHP"
  },
  {
    "subcategory": "2WAY 카세트",
    "series": "SINGLE / Universal",
    "energySource": "EHP"
  },
  {
    "subcategory": "4WAY 카세트(듀얼베인)",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "4WAY 카세트(듀얼베인)",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "1WAY 카세트(듀얼베인)",
    "series": "Multi V S(주거) (4way->1way수정)",
    "energySource": "EHP"
  },
  {
    "subcategory": "4WAY 카세트(듀얼베인)",
    "series": "SINGLE / Universal",
    "energySource": "EHP"
  },
  {
    "subcategory": "4WAY 카세트",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "4WAY 카세트",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "4WAY 카세트",
    "series": "Multi V 실내기(큐레이션)",
    "energySource": "EHP"
  },
  {
    "subcategory": "기타(V계열·확인요망)",
    "series": "SINGLE / Universal",
    "energySource": "EHP"
  },
  {
    "subcategory": "덕트(고정압)",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "덕트(고정압)",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "덕트(고정압)",
    "series": "Multi V 실내기(천장매립덕트)",
    "energySource": "EHP"
  },
  {
    "subcategory": "덕트(대공간)",
    "series": "Multi V 실내기(대공간덕트)",
    "energySource": "EHP"
  },
  {
    "subcategory": "덕트(저정압)",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "바닥상치형",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "벽걸이형",
    "series": "MULTI (ALL in 1)",
    "energySource": "EHP"
  },
  {
    "subcategory": "벽걸이형",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "벽걸이형",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "벽걸이형",
    "series": "SINGLE / Universal",
    "energySource": "EHP"
  },
  {
    "subcategory": "상업용 천장형",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "스탠드·패키지형(확인요망)",
    "series": "SINGLE / Universal",
    "energySource": "EHP"
  },
  {
    "subcategory": "스탠드형",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "스탠드형",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "시스템보일러",
    "series": "Multi V 실내기(시스템보일러)",
    "energySource": "EHP"
  },
  {
    "subcategory": "원형 카세트(노출)",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "원형 카세트(매립)",
    "series": "Multi V 실내기(민수전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "원형 카세트(매립)",
    "series": "Multi V 실내기(조달전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "천장형 카세트",
    "series": "SINGLE / Universal",
    "energySource": "EHP"
  },
  {
    "subcategory": "천장형(확인요망)",
    "series": "Smart Multi V S(주거_냉방전용)",
    "energySource": "EHP"
  },
  {
    "subcategory": "천장형",
    "series": "Multi V S(주거)",
    "energySource": "EHP"
  },
  {
    "subcategory": "DOAS(외기처리 공조기)",
    "series": "DOAS / Slim DOAS",
    "energySource": "EHP"
  },
  {
    "subcategory": "FCU(팬코일 유닛)",
    "series": "FCU",
    "energySource": "EHP"
  }
]

export const COMPAT_OUTDOOR_ROWS: readonly CompatOutdoorRow[] = [
  {
    "energySource": "수냉식",
    "subcategory": "수냉식 스크롤 칠러",
    "series": "Water-Cooled Scroll Chiller",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "수냉식",
    "subcategory": "수냉식",
    "series": "Multi V Water 5",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "수냉식",
    "subcategory": "수냉식",
    "series": "Multi V Water IV",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "수냉식",
    "subcategory": "수냉식",
    "series": "Multi V Water S",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "AWHP",
    "subcategory": "AWHP",
    "series": "AWHP 싱글 시스템보일러",
    "values": "-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "AWHP",
    "subcategory": "AWHP",
    "series": "AWHP 일체형 시스템보일러",
    "values": "-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "CDU",
    "subcategory": "냉장·냉동 CDU",
    "series": "CDU",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "CDU",
    "subcategory": "냉장·냉동 CDU",
    "series": "Cold Chain CDU",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "Chiller",
    "subcategory": "공랭식 스크롤 칠러",
    "series": "Air-Cooled Scroll Chiller",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "가정용 멀티(ALL in 1)",
    "series": "MULTI (ALL in 1)",
    "values": "XDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V 실외기(큐레이션)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V i(공장형)",
    "values": "XXOOOOOXOOXXOOOXOOOOOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V i(슈프림)",
    "values": "XXOOOOOXOOXXOOOXOOOOOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V i(슈프림라이트)",
    "values": "XXOOOOOXOOXXOOOXOOOOOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V i(프리미엄)",
    "values": "XXOOOOOXOOXXOOOXOOOOOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V i(프리미엄라이트)",
    "values": "XXOOOOOXOOXXOOOXOOOOOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V S",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V S(상업)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V S(주거)->주거가 아니라 냉방전용인듯합니다",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V S(R32)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V Super 5(고급형)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V Super 5(공장형)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V Super 5(슈프림)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V Super 5(프리미엄)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "Multi V Super 5(한랭지향_X9H)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "TA Multi V Super 5(고급형)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉난방 절환형",
    "series": "TA Multi V Super 5(일반형)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉방전용",
    "series": "Multi V S",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉방전용",
    "series": "Multi V Super 5(일반형_냉전)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "냉방전용",
    "series": "Smart Multi V S(주거_냉방전용)",
    "values": "XXXXXXXXXXOXXXXXXXXXXXXXXXXXXXXXXXXXOXX"
  },
  {
    "energySource": "EHP",
    "subcategory": "동시형",
    "series": "Multi V i(동시형)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXOX"
  },
  {
    "energySource": "EHP",
    "subcategory": "동시형",
    "series": "Multi V Super 5(동시형)",
    "values": "XXOOOOOXOOXXOOOXOOOXOOXOOXOXOOOOOOXXXOX"
  },
  {
    "energySource": "EHP",
    "subcategory": "시스템 에어컨(단품)",
    "series": "SINGLE / Universal",
    "values": "X--------------------------------------"
  },
  {
    "energySource": "GHP",
    "subcategory": "GHP",
    "series": "GHP Super III",
    "values": "XXXXXXXXXXXXXXXXXXXOXXXXXXXXXXXXXXXXXXX"
  },
  {
    "energySource": "GHP",
    "subcategory": "GHP",
    "series": "Multi V 실외기(큐레이션)",
    "values": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
  }
]

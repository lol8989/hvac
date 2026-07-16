// 실내기가 냉매식(VRF/Multi V) 실외기와 조합 가능한지 — 생성 컨텍스트 도메인 규칙.
//
// 현업 확인(2026-07-16, doc/실내기_실외기_조합_확인표_260716_현업회신.xlsx 질문 2):
//   "FCU는 물(냉·온수 코일) 기반이라 Multi V 실외기 시리즈와 연결할 수 없다.
//    현재 개발하는 에이전트에서 FCU는 제외해도 된다."
// FCU는 냉매배관이 아니라 냉·온수 배관으로 열원(칠러·보일러)에 붙으므로 실외기 조합 후보가 아니다.
//
// 냉매 종류(R32/R410A)는 조합을 가르지 않는다(질문 1: 냉매 타입이 달라도 실내기는 공용으로 사용 가능).
// → 이 규칙은 냉매 종류가 아니라 '냉매식이냐 물 기반이냐'로만 가른다. 냉매 종류로 조합을 막지 않는다.

// 물 기반(냉·온수 코일) 실내기 — 냉매식 실외기 조합 후보에서 뺀다. 현재 확인된 대상은 FCU뿐이다.
const NON_REFRIGERANT_INDOOR = /FCU|팬코일/

export const isRefrigerantCombinableIndoor = (subcategory: string): boolean => !NON_REFRIGERANT_INDOOR.test(subcategory)

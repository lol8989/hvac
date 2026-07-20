// 장비번호 산식 — 순수 도메인.
//
// 근거: 0708 회의록 「장비번호기입」
//   1웨이 와트 C · 2웨이 와트 G · 4웨이 와트 T · 스탠드 와트 P · 실외기 마력
// 큐레이션 게시본(장비선정표 검증값)이 이 산식과 정확히 일치한다:
//   RNW0201C2S 1WAY 2,000W → 20C   ·   RNW0521G2S 2WAY 5,200W → 52G
//   RNW0601A2U 4WAY 6,000W → 60T   ·   RNW1001A2U 4WAY 10,000W → 100T
// 즉 **장비번호 = 냉방용량(W) ÷ 100 + 유형문자**.
//
// ⚠️ 회의록이 규칙을 준 유형은 위 넷뿐이다. 덕트·벽걸이·원형 카세트·천장형 등은 문자가 정해지지
//    않았으므로 null을 돌려준다 — 장비번호는 발주 식별자라 지어내면 안 된다(CLAUDE.md §8).
//    현업이 나머지 문자를 확정해 주면 LETTER_RULES에 줄만 추가하면 된다.

// 유형(중분류) → 장비번호 문자. 위에서부터 먼저 걸리는 규칙을 쓴다
// ('4WAY 카세트(듀얼베인)'은 '4WAY'에 걸려야 한다).
const LETTER_RULES: ReadonlyArray<[RegExp, string]> = [
  [/1\s*WAY/i, 'C'],
  [/2\s*WAY/i, 'G'],
  [/4\s*WAY/i, 'T'],
  [/스탠드/, 'P'],
]

export const EQUIPMENT_CODE_LETTERS = Object.freeze({
  '1WAY': 'C',
  '2WAY': 'G',
  '4WAY': 'T',
  스탠드: 'P',
})

const letterFor = (subcategory: string): string | null =>
  LETTER_RULES.find(([re]) => re.test(subcategory))?.[1] ?? null

// 실내기 장비번호. 규칙이 없는 유형이거나 냉방용량이 없으면 null(호출부가 모델코드로 폴백한다).
export function indoorEquipmentCode(subcategory: string, coolingW: number | null): string | null {
  const letter = letterFor(subcategory)
  if (letter === null) return null
  if (coolingW === null || !Number.isFinite(coolingW) || coolingW <= 0) return null

  const hundreds = Math.round(coolingW / 100)
  if (hundreds <= 0) return null // 반올림해서 0이면 번호가 되지 못한다

  return `${hundreds}${letter}`
}

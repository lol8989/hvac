// 모델명(ModelCode)에서 파생되는 스펙 — 순수 도메인.
//
// 실외기 마력(HP): LG 스펙시트 어디에도 마력 항목이 없다(50개 파일 중 냉장·냉동 CDU 3건 예외).
// 대신 모델명이 HP를 인코딩한다: 접두 알파벳(하이픈 허용) 뒤 첫 두 자리 숫자가 HP다.
//   RPUW281X9P → 28 · RPUB081X9E → 8 · RP-B261X9E → 26 · GPUW280C2S → 28 · GP-W560C2S → 56
// 냉방kW ÷ 상수로는 유도할 수 없다 — 계열마다 kW/HP 비가 다르다(고급형 2.80, 동시형 2.91, GHP 2.93).

// 접두: 알파벳 1자 이상 + (하이픈 + 알파벳)? → 그 뒤 두 자리 숫자
const HP_PATTERN = /^[A-Z]+(?:-[A-Z]+)?(\d{2})/

const MIN_HP = 1
const MAX_HP = 99

// 추출 실패(샤시명 등)나 비현실적 값이면 null — 호출측이 오류 행으로 분류한다.
export function horsepowerFromModelCode(modelCode: string): number | null {
  const m = HP_PATTERN.exec(modelCode.trim().toUpperCase())
  if (!m) return null
  const hp = Number(m[1])
  return hp >= MIN_HP && hp <= MAX_HP ? hp : null
}

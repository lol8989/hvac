// 조합비 표기 — 비율(1.03)과 퍼센트(103%)를 오가는 곳이 여러 군데라 한 곳에 모은다.
// 실무는 "103%"로 말하고 도메인은 1.03으로 계산한다.

// 0.5 → '50%', 1.03 → '103%'
export const toPercentLabel = (ratio: number): string => `${Math.round(ratio * 1000) / 10}%`

// 입력 문자열(퍼센트) → 비율. 빈 값·숫자가 아니면 null.
export function parsePercent(input: string): number | null {
  const t = input.trim().replace('%', '')
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 10) / 1000 // 103 → 1.03 (소수 셋째 자리까지)
}

// 비율 → 입력창에 넣을 퍼센트 문자열 (1.03 → '103')
export const toPercentInput = (ratio: number): string => String(Math.round(ratio * 1000) / 10)

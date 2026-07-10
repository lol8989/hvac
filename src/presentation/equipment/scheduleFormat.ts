// 장비일람표 값 변환기 — 스펙시트 원문 → 일람표 표기. 순수 함수.
//
// 원문은 product_specs에 그대로 둔다(SSOT). 변환은 출력할 때만 한다(주인님 확정 2026-07-10).
// 변환 규칙이 바뀌어도 1,206모델을 다시 적재할 필요가 없다.
//
// 원문 형식이 예상과 다르면 값을 지어내지 않고 원문을 그대로 흘린다.
// 근거: doc/05_설계결정/일람표_컬럼_매핑표.md §2·§4

export const DASH = '-'

// 스펙시트는 천단위를 공백으로 끊는다. 일반 공백뿐 아니라 NBSP·NNBSP·얇은 공백이 섞여 있다.
const stripSpaces = (s: string): string => s.replace(/[\s\u00A0\u202F\u2009]/g, '')

const blank = (v: string | null | undefined): boolean => v == null || v.trim() === '' || v.trim() === '-'

// 첫 숫자만 뽑는다: 'Φ6.35 (1/4)' → '6.35', '31.2 (Hose)' → '31.2'
export function firstNumber(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  const m = /\d+(?:\.\d+)?/.exec(stripSpaces(raw!))
  return m ? m[0] : DASH
}

// 슬래시로 나뉜 값의 첫 항목: '32 / 25' → '32'
export function firstOf(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  const head = raw!.split('/')[0].trim()
  return head === '' || head === '-' ? DASH : head
}

// 강/중/약 중 최댓값: '- / 7.6 / 7.1 / 6.2' → '7.6'
export function maxOf(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  const nums = (stripSpaces(raw!).match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
  if (!nums.length) return DASH
  return String(Math.max(...nums))
}

// 전원: '220, 1상(2선), 60' → '1, 2, 220, 60' (상, 선식, V, Hz)
// 원문 형식이 다르면 원문 그대로.
const POWER = /^\s*(\d+)\s*,\s*(\d+)\s*상\s*\(\s*(\d+)\s*선\s*\)\s*,\s*(\d+)\s*$/
export function powerSupply(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  const m = POWER.exec(raw!)
  if (!m) return raw!.trim()
  const [, volt, phase, wires, hz] = m
  return `${phase}, ${wires}, ${volt}, ${hz}`
}

// 치수: '1 880 x 2 180 x 960' → '1880x2180x960'
export function dimensions(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  return stripSpaces(raw!).replace(/,/g, '').replace(/[×X]/g, 'x')
}

// 전선: '0.75 ~ 1.5 × 2' → '0.75~1.5x2C'
export function wireSpec(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  const s = stripSpaces(raw!).replace(/×/g, 'x')
  return /C$/.test(s) ? s : `${s}C`
}

// 누전차단기: '15' → '15A'
export function breaker(raw: string | null | undefined): string {
  if (blank(raw)) return DASH
  const s = raw!.trim()
  return /A$/i.test(s) ? s : `${s}A`
}

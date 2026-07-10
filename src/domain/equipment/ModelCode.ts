// 모델명(ModelCode)에서 파생되는 스펙 — 순수 도메인.
//
// 실외기 마력(HP): LG 스펙시트 어디에도 마력 항목이 없다(50개 파일 중 냉장·냉동 CDU 3건 예외).
// 대신 모델명이 HP를 인코딩한다: 접두 알파벳(하이픈 허용) 뒤 숫자 블록의 앞자리가 HP다.
//   RPUW281X9P → 28 · RPUB081X9E → 8 · RP-B261X9E → 26 · GPUW280C2S → 28 · GP-W560C2S → 56
// 냉방kW ÷ 상수로는 유도할 수 없다 — 계열마다 kW/HP 비가 다르다(고급형 2.80, 동시형 2.91, GHP 2.93).
//
// 다만 블록의 마지막 자리는 HP가 아니라 변형 코드이고, 그 코드가 숫자일 수도 문자일 수도 있다.
//   RPUW281X9P  → 블록 '281'  → 28HP + 변형 '1'
//   RP-Q1001X9S → 블록 '1001' → 100HP + 변형 '1'
//   RP-Q100PX9S → 블록 '100'  → 100HP + 변형 'P'(문자)
// 즉 블록 길이만으로 28HP와 100HP를 가를 수 없다. 냉방용량 환산이 유일한 판별 근거다.
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md §4

import { horsepowerFromCapacityW } from '../shared/Horsepower'

// 접두: 알파벳 1자 이상 + (하이픈 + 알파벳)? → 그 뒤 연속 숫자 블록
const HP_BLOCK = /^[A-Z]+(?:-[A-Z]+)?(\d+)/

const MIN_HP = 1
const MAX_HP = 99

// 세 자리 후보는 100HP대만 인정한다. '281'→281HP, '001'→1HP 같은 오인식을 막는다.
const MIN_HP3 = 100
const MAX_HP3 = 199

// 모델명에서 뽑을 수 있는 HP 후보(앞 2자리 / 앞 3자리)를 유효한 것만 모은다.
function candidates(block: string): number[] {
  const out: number[] = []
  if (block.length >= 2) {
    const hp2 = Number(block.slice(0, 2))
    if (hp2 >= MIN_HP && hp2 <= MAX_HP) out.push(hp2)
  }
  if (block.length >= 3) {
    const hp3 = Number(block.slice(0, 3))
    if (hp3 >= MIN_HP3 && hp3 <= MAX_HP3) out.push(hp3)
  }
  return out
}

// 냉방용량(W)을 주면 환산 추정치에 가장 가까운 후보를 고른다.
// 주지 않으면 앞 두 자리(기존 동작)를 쓴다 — 100HP대 모델은 오독되므로 가능하면 용량을 넘길 것.
//
// 추출 실패(샤시명 등)나 비현실적 값이면 null — 호출측이 오류 행으로 분류한다.
export function horsepowerFromModelCode(modelCode: string, coolingW?: number | null): number | null {
  const m = HP_BLOCK.exec(modelCode.trim().toUpperCase())
  if (!m) return null

  const found = candidates(m[1])
  if (found.length === 0) return null
  if (found.length === 1) return found[0]

  const estimate = horsepowerFromCapacityW(coolingW)
  if (estimate === null) return found[0] // 용량 미상 → 앞 두 자리

  return found.reduce((best, hp) => (Math.abs(hp - estimate) < Math.abs(best - estimate) ? hp : best))
}

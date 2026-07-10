// 마력(HP) 환산 — Shared Kernel. 순수 함수, 프레임워크 무지.
//
// 출처: Confluence「실내기·실외기 자동배치 룰」 0708 회의 확정 환산식.
//   1마력 = 2500 kcal/h,  2500 kcal/h ÷ 0.86 = 2906.98 W
// 원문에 `1hp : 2900w` 표기도 있으나 이는 반올림값이다(주인님 확정 2026-07-10: 2907 채택).
// 같은 0.86 상수 계보를 UnitLoad의 kcal→W 변환(×1.163)이 쓴다.
//
// ⚠️ 이 식은 HP의 **산출식이 아니라 검증·백필식**이다. 계열별 실측 W/HP가 2,813~2,900으로
// 흩어져 단일 상수로 역산하면 정수 HP를 66.9%밖에 재현하지 못한다(실외기 670건 전수 대조).
// 정확한 HP의 1차 출처는 모델명 유도(ModelCode.ts)이며, 이 식은 두 곳에만 쓴다.
//   1) 모델명 해석이 애매할 때의 판별기 (100HP대 vs 10HP)
//   2) 모델명이 HP를 인코딩하지 않는 계열(칠러·CDU·단품)의 백필
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md

export const HP_TO_KCAL_H = 2500
export const KCAL_H_TO_W_DIVISOR = 0.86
export const HP_TO_W = HP_TO_KCAL_H / KCAL_H_TO_W_DIVISOR // 2906.9767...

const round2 = (v: number): number => Math.round(v * 100) / 100

// 냉방용량(W) → 추정 마력.
//  - 1HP 이상: 정수 반올림 (주인님 확정 2026-07-10)
//  - 1HP 미만: 소수 둘째 자리까지 보존 (소용량 CDU를 1HP로 부풀리지 않는다)
//  - 용량이 없거나 0 이하/비유한수, 또는 소수 둘째 자리에서도 0이면 null
export function horsepowerFromCapacityW(coolingW: number | null | undefined): number | null {
  if (typeof coolingW !== 'number' || !Number.isFinite(coolingW) || coolingW <= 0) return null

  const raw = coolingW / HP_TO_W
  const hp = raw >= 1 ? Math.round(raw) : round2(raw)
  return hp > 0 ? hp : null
}

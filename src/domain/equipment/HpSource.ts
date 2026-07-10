// 마력(HP) 값의 출처 — 추정치와 실측치를 구분한다.
//
// 백필된 HP는 카탈로그 실측이 아니라 냉방용량 환산 추정치다(오차 ±10% 내 98%, 정수 일치 67%).
// 조합비·분할 한도 계산에 흘러들어가므로 출처를 데이터에 남긴다.
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md §5

export const HP_SOURCES = ['MODEL_CODE', 'DERIVED', 'CURATED', 'MANUAL'] as const

export type HpSource = (typeof HP_SOURCES)[number]

export const HP_SOURCE_LABEL: Record<HpSource, string> = {
  MODEL_CODE: '모델명 유도',
  DERIVED: '용량 환산(추정)',
  CURATED: '큐레이션',
  MANUAL: '직접 입력',
}

export const isHpSource = (v: unknown): v is HpSource => typeof v === 'string' && (HP_SOURCES as readonly string[]).includes(v)

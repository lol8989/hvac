// Adjustable<T> (Shared Kernel · Value Wrapper).
// "AI 기본값 + 사용자 오버라이드" provenance 래퍼. 불변(frozen) + 비파괴 갱신.
// 정책 핵심: withAi는 AI 재실행 시 user 오버라이드(수정 셀)를 보존한다.
// 오버라이드 판정은 !== undefined — 0, '' 같은 falsy 값도 유효한 오버라이드.

export interface Adjustable<T> {
  readonly ai: T
  readonly user?: T
}

// AI 값만 가진 래퍼 생성 (frozen, user 키 없음)
export const adjustable = <T>(ai: T): Adjustable<T> => Object.freeze({ ai })

// 유효값: user가 설정돼 있으면 user, 아니면 ai
export const effective = <T>(a: Adjustable<T>): T =>
  a.user !== undefined ? a.user : a.ai

// 사용자 오버라이드 여부
export const isOverridden = <T>(a: Adjustable<T>): boolean => a.user !== undefined

// 오버라이드 설정 (새 frozen 객체 반환, 원본 비파괴)
export const withUser = <T>(a: Adjustable<T>, v: T): Adjustable<T> =>
  Object.freeze({ ai: a.ai, user: v })

// 오버라이드 해제 (ai 유지, user 키 자체 제거)
export const clearUser = <T>(a: Adjustable<T>): Adjustable<T> =>
  Object.freeze({ ai: a.ai })

// AI 값만 갱신, user 보존 — "AI 재실행 시 수정 셀 보존" 정책의 핵심
export const withAi = <T>(a: Adjustable<T>, v: T): Adjustable<T> =>
  Object.freeze(a.user !== undefined ? { ai: v, user: a.user } : { ai: v })

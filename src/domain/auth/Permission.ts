// 권한 규칙 — 순수 도메인. React·라우팅·세션 저장소를 모른다.
//
// 로그인은 아직 없다(주인님 지시 2026-07-10). 인증이 붙으면 Principal의 출처만 바뀌고
// 여기 규칙은 그대로 남는다 — 그래서 UI가 아니라 도메인에 둔다.
//
// fail-closed: 사용자를 알 수 없거나 모르는 역할이면 거부한다.
// 새 역할이 생겼는데 규칙에 안 적혔다면, 조용히 열리는 것보다 조용히 막히는 편이 안전하다.

export const ROLES = ['ADMIN', 'USER'] as const

export type Role = (typeof ROLES)[number]

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v)

// 인증된 주체. 실서비스에서는 세션/토큰에서 만든다.
export interface Principal {
  role: Role
}

// 장비마스터 관리(등록·수정·게시·업로드) 권한.
export function canManageEquipment(principal: Principal | null | undefined): boolean {
  return principal != null && isRole(principal.role) && principal.role === 'ADMIN'
}

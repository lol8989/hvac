import type { StepId } from '../../domain/generation/StepGuard'

// 실외기 자동 선정 정책(순수) — App의 useEffect가 '언제' 부를지를 이 함수가 결정한다.
// 정책과 이펙트 메커니즘을 분리해 테스트 가능하게 둔다(§5.6 SRP).
//
// 규칙:
//  - 조합·실외기 배치 단계에서만 (실외기가 이 단계의 산출물이므로).
//  - 그룹이 아직 없을 때만 1회 — 이미 그룹이 있으면 사용자 조정을 덮어쓰지 않는다.
//  - 배치된 실내기가 있어야 선정 대상이 있다.
//  - 사용자가 방금 실외기를 삭제해 그룹을 비운 경우(suppressed)엔 재선정하지 않는다.
//    안 그러면 삭제 버튼이 단일 그룹에서 무변화로 보인다(주인님 결정 2026-07-22, b안).
export function shouldAutoSelectOutdoor(p: {
  step: StepId
  groupCount: number
  placementCount: number
  suppressed: boolean
}): boolean {
  if (p.step !== 'combine' && p.step !== 'outdoor') return false
  if (p.groupCount > 0) return false
  if (p.placementCount === 0) return false
  if (p.suppressed) return false
  return true
}

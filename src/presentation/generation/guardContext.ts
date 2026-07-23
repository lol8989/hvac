// 스텝 가드 컨텍스트 조립 — 순수 함수.
//
// 도메인 가드(StepGuard)가 "다음 단계로 가도 되는가"를 판정하려면 현재 상태의 요약(GuardContext)이 필요하다.
// 그 요약을 만드는 일(무엇을 세는가)과 판정을 실행하는 일(runGuarded)·상태 전이를 분리한다(§5.6 SRP).
// 이 함수는 파생값(그룹·풀·선정표)을 받아 세기만 한다 — React·이펙트를 모른다(렌더 밖에서 테스트 가능).
import type { GuardContext } from '../../domain/generation/StepGuard'
import type { GroupView } from './planAdapter'
import type { ClearanceReport } from './clearanceReport'

export interface GuardContextInput {
  domainRooms: Record<string, { name: string }>
  placements: Record<string, unknown>
  pool: readonly string[]
  groups: readonly GroupView[]
  activeGroups: readonly GroupView[]
  outdoorPositions: Record<string, unknown>
  // 이격은 '검사했는가'와 '위반이 있는가'가 다른 축이다(clearanceReport 참조).
  clearance: ClearanceReport
  // 선정표 행 = 실. BOM만 있고 행이 없으면 산출물이 빈 표가 된다.
  selectionRowCount: number
}

export function buildGuardContext(input: GuardContextInput): GuardContext {
  const { domainRooms, placements, pool, groups, activeGroups, outdoorPositions, clearance, selectionRowCount } = input
  return {
    roomCount: Object.keys(domainRooms).length,
    placedRoomCount: Object.keys(placements).length,
    roomsWithoutIndoor: Object.keys(domainRooms).filter((id) => !placements[id]).map((id) => domainRooms[id].name),
    unassignedRoomCount: pool.length,
    activeGroupCount: activeGroups.length,
    emptyGroupCount: groups.length - activeGroups.length,
    overloadedGroups: activeGroups.filter((g) => g.judgement === 'OVERLOADED').map((g) => g.label),
    groupsWithoutPosition: activeGroups.filter((g) => !outdoorPositions[g.key]).map((g) => g.label),
    clearanceChecked: clearance.checked,
    clearanceViolations: [...clearance.violations],
    selectionRowCount,
  }
}

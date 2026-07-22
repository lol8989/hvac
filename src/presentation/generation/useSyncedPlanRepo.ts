// 실외기 플랜(AssignmentPlan) ↔ 리포지토리 ↔ 배치(placements) 정렬 동기 — 한 곳에서(§5.7 결정 #2).
//
// 세 저장소가 같은 플랜을 봐야 한다: undo 히스토리(World.plan)·리포지토리(유즈케이스가 읽는 곳)·
// 배치(대수·모델의 SSOT). App.tsx에 흩어져 있던 두 repo-쓰기 이펙트를 한 훅으로 모아
// "누가 언제 무엇을 덮어썼는가"를 한자리에서 읽게 한다.
//
// 두 이펙트는 트리거가 다르므로(하나는 plan 변경, 하나는 placements 변경) 한 useEffect로 합칠 수 없다 —
// 합치면 plan만 바뀐 경우(undo·조합 편집)에도 배치에서 플랜을 재유도해 방금 한 편집을 덮어쓴다.
// 대신 한 훅 안에 선언 순서(A→B)를 고정해 둔다: B는 A가 저장한 리포지토리를 읽는다.
import { useEffect } from 'react'
import { syncPlanUnits } from './planAdapter'
import type { PlanRepository } from '../../application/generation/ports'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { Room as DomainRoom } from '../../domain/generation/Room'
import type { Placement } from '../../domain/generation/Placement'
import type { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { World } from './world'

export interface SyncedPlanRepoInput {
  repo: PlanRepository
  plan: AssignmentPlan
  placements: Record<string, Placement>
  domainRooms: Record<string, DomainRoom>
  unitsFrom: (ps: Record<string, Placement>) => IndoorUnit[]
  replace: (fn: (w: World) => World) => void
}

export function useSyncedPlanRepo(input: SyncedPlanRepoInput): void {
  const { repo, plan, placements, domainRooms, unitsFrom, replace } = input

  // (A) 되돌리기로 플랜이 과거로 돌아가면 리포지토리도 그 시점으로 맞춘다 —
  // 유즈케이스(배정·그룹 편집)는 리포지토리를 읽으므로, 어긋나면 undo가 반쯤만 적용된다.
  useEffect(() => { repo.save(plan) }, [plan, repo])

  // (B) 실내기 배치(placements)가 대수·모델의 SSOT다. 바뀌면 플랜을 그에 맞춘다
  // — 그러지 않으면 선정표에서 대수를 고쳐도 조합비·최대 연결 대수가 낡은 값을 본다.
  // 배정은 최대한 보존된다(syncPlanUnits). 이것은 **파생 동기화**라 히스토리를 남기지 않는다
  // (남기면 Ctrl+Z가 사용자가 한 적 없는 일을 되돌린다).
  useEffect(() => {
    const next = syncPlanUnits(repo.load(), unitsFrom(placements))
    repo.save(next)
    replace((w) => ({ ...w, plan: next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, domainRooms, repo])
}

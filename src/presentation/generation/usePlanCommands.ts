// 실외기 조합(AssignmentPlan) 편집 커맨드 묶음 — 선정·재배정·삭제·모델교체 + 자동선정 이펙트.
//
// App.tsx에서 실외기 조합을 다루던 핸들러가 리포지토리(uc)·플랜·flash·undo를 함께 만지며
// 뷰와 엉켜 있었다(§5.8 스멜). 한 액터(실외기 조합 편집)의 흐름을 한 곳으로 모은다.
//
// SSOT: 배정 상태는 도메인 AssignmentPlan이 소유하고, 유즈케이스(uc)가 리포지토리를 고친다.
// 이 훅은 그 결과를 World로 커밋(sync)하거나, 자동 선정은 파생 부트스트랩이라 히스토리를
// 남기지 않는다(replace, §5.7). 정책 판단(자동선정 발화)은 순수 함수 shouldAutoSelectOutdoor로 뺀다.
import { useEffect } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { PlanRepository, OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'
import type { CompatPredicate } from '../../domain/generation/selectOutdoorUnits'
import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { Room as DomainRoom } from '../../domain/generation/Room'
import type { Placement } from '../../domain/generation/Placement'
import type { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { StepId } from '../../domain/generation/StepGuard'
import type { World } from './world'
import type { makeReassignRoom } from '../../application/generation/ReassignRoom'
import type { makeReplaceOutdoorModel } from '../../application/generation/ReplaceOutdoorModel'
import type { makeAddGroup, makeRemoveGroup } from '../../application/generation/GroupCommands'
import { selectOutdoorPlan, nextGroupMeta, outdoorUnitFromSpec } from './planAdapter'
import { shouldAutoSelectOutdoor } from './autoSelectOutdoor'
import { NoCompatibleOutdoorError, UnpackableLoadError, NotFoundError } from '../../domain/generation/errors'

// 유즈케이스 포트 묶음 — App의 컴포지션 루트가 리포지토리를 주입해 만든 인스턴스.
export interface PlanUseCases {
  reassign: ReturnType<typeof makeReassignRoom>
  replace: ReturnType<typeof makeReplaceOutdoorModel>
  add: ReturnType<typeof makeAddGroup>
  remove: ReturnType<typeof makeRemoveGroup>
}

export interface PlanCommandsInput {
  repo: PlanRepository
  uc: PlanUseCases
  catalog: OutdoorModelCatalog
  isOutdoorCompatible: CompatPredicate
  plan: AssignmentPlan
  domainRooms: Record<string, DomainRoom>
  placements: Record<string, Placement>
  // 배치(placements) → 도메인 실내기 유닛 목록. App이 소유(카탈로그·실 정보 조인).
  unitsFrom: (ps: Record<string, Placement>) => IndoorUnit[]
  step: StepId
  // 사용자가 실외기를 삭제해 그룹을 비웠으면 자동 선정을 억제한다(재배치에서 App이 해제).
  suppressAutoSelectRef: MutableRefObject<boolean>
  // 사용자 편집 1회 = 커밋 1회(= Ctrl+Z 1회). 자동 선정은 파생이라 replace(히스토리 미기록).
  edit: (fn: (w: World) => World, label: string) => void
  replace: (fn: (w: World) => World) => void
  setSelRooms: Dispatch<SetStateAction<string[]>>
  flash: (msg: string) => void
}

export interface PlanCommands {
  moveRoom: (id: string, to: string) => boolean
  removeGroup: (key: string) => void
  replaceModel: (key: string, spec: OutdoorModelSpec) => void
  selectOutdoorForSelected: (roomIds: readonly string[]) => void
}

export function usePlanCommands(input: PlanCommandsInput): PlanCommands {
  const {
    repo, uc, catalog, isOutdoorCompatible, plan, domainRooms, placements,
    unitsFrom, step, suppressAutoSelectRef, edit, replace, setSelRooms, flash,
  } = input

  // 유즈케이스가 리포지토리를 고친 뒤 그 결과를 World에 커밋한다(= 되돌릴 수 있는 편집 1건).
  const sync = (label: string) => edit((w) => ({ ...w, plan: repo.load() }), label)
  // 실이 도면 어느 층에 있는지 — 실외기 버킷(층×계열)의 기준.
  const floorOf = (roomId: string): string => domainRooms[roomId]?.floor ?? ''
  // 실을 빼서 빈 그룹이 되면 자동 정리한다(분할·삭제 버튼을 없앤 대체 — 그룹은 선정으로만 생긴다).
  const cleanEmptyGroups = () => {
    for (const g of repo.load().groups) if (g.roomIds.length === 0) uc.remove({ key: g.key })
  }
  // 도메인 선정(층×계열 버킷·조합비)을 호출하고, 알려진 도메인 에러(호환 실외기 없음·분할 불가)는
  // 화면을 죽이지 않고 flash로 옮긴다. 성공하면 onOk(선정 플랜)을 실행한다.
  const trySelectOutdoor = <T,>(units: readonly IndoorUnit[], onOk: (plan: AssignmentPlan) => T): T | undefined => {
    try {
      return onOk(selectOutdoorPlan(units, floorOf, catalog, isOutdoorCompatible))
    } catch (e) {
      if (e instanceof NoCompatibleOutdoorError || e instanceof UnpackableLoadError) { flash(e.message); return undefined }
      throw e
    }
  }

  // 실외기 선정·조합: 배치된 실내기의 정격 총용량으로 실외기를 고른다(도메인 규칙).
  // 실외기 대수·모델은 상수가 아니라 이 계산의 결과다.
  const runOutdoorSelection = (): boolean => {
    const units = unitsFrom(placements)
    if (!units.length) { flash('실내기를 먼저 배치해야 실외기를 선정할 수 있습니다'); return false }
    const ok = trySelectOutdoor(units, (next) => {
      repo.save(next)
      // 자동 선정은 파생 부트스트랩이다(사용자가 누른 액션이 아니다) → 히스토리에 남기지 않는다(§5.7).
      // commit하면 Ctrl+Z가 '사용자가 한 적 없는 선정'을 되돌리려다, 그룹이 0이 되어 이 이펙트가
      // 즉시 재선정 → undo가 무효가 된다. replace로 현재 스냅샷만 갱신한다.
      replace((w) => ({ ...w, plan: next }))
      flash(`✦ 정격 ${(units.reduce((a, u) => a + u.cool.kw, 0)).toFixed(1)}kW에 맞춰 실외기 ${next.groups.length}대를 선정했습니다`)
      return true
    })
    return ok ?? false
  }

  // 실외기 단계에 처음 들어오면 선정을 1회 자동 실행한다(그룹이 아직 없을 때만).
  // 이후 사용자가 매핑 팝업에서 조정한 결과는 덮어쓰지 않는다. 사용자가 방금 실외기를
  // 삭제해 그룹을 비운 경우(suppressAutoSelectRef)엔 재선정하지 않는다 — 안 그러면
  // 단일 그룹 삭제가 즉시 재선정돼 무변화로 보인다(주인님 결정 2026-07-22, b안).
  useEffect(() => {
    if (!shouldAutoSelectOutdoor({
      step,
      groupCount: plan.groups.length,
      placementCount: Object.keys(placements).length,
      suppressed: suppressAutoSelectRef.current,
    })) return
    runOutdoorSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, plan, placements])

  // 실(그 실의 모든 실내기 대수)을 대상(to = 그룹 key 또는 'pool')으로 이동. 호환 불가 시 false.
  const moveRoom = (id: string, to: string): boolean => {
    try {
      const res = uc.reassign({ roomId: id, to })
      if (res.ok) {
        cleanEmptyGroups()
        sync('실외기 배정 변경')
      }
      return res.ok
    } catch (e) {
      if (e instanceof NotFoundError) return false
      throw e
    }
  }

  // 실외기 카드 삭제 — 연결된 실은 미배정 풀로 돌아간다(다시 선정하면 새 그룹으로 묶인다).
  const removeGroup = (key: string) => {
    const g = plan.groupByKey(key)
    if (!g) return
    // 사용자가 명시적으로 삭제했으면 그룹이 0이 되어도 자동 선정으로 되살리지 않는다.
    suppressAutoSelectRef.current = true
    uc.remove({ key })
    sync('실외기 삭제')
    flash(`${g.label}을(를) 삭제했습니다 — 연결 실 ${g.roomIds.length}곳이 미배정으로 돌아갔습니다`)
  }

  // 실외기 모델 교체. 계열이 바뀌어 호환 안 되는 실내기는 미배정 풀로 반환.
  const replaceModel = (key: string, spec: OutdoorModelSpec) => {
    const g = plan.groupByKey(key)
    if (!g) return
    const res = uc.replace({ key, outdoorUnit: outdoorUnitFromSpec(spec) })
    sync('실외기 모델 교체')
    if (res.ejected.length) {
      flash(`실외기 교체: 계열이 달라 실내기 ${res.ejected.length}개를 미배정으로 옮겼습니다`)
    } else {
      flash(`실외기 ${g.label} 모델을 ${spec.model}(으)로 교체했습니다`)
    }
  }

  // ── 실외기 선정: 도면에서 선택한 실들 위에 뜨는 오버레이 버튼이 부른다(분할·삭제·선정대기 대체) ──
  // 선택한 실들만 대상으로 실외기를 선정해 새 그룹으로 묶는다(전체 재선정이 아니다). 이미 다른
  // 실외기에 있던 실도 이 새 그룹으로 옮겨지고, 비게 된 옛 그룹은 자동 정리된다.
  const selectOutdoorForSelected = (roomIds: readonly string[]) => {
    const set = new Set(roomIds)
    const units = unitsFrom(placements).filter((u) => set.has(u.roomId))
    if (!units.length) { flash('선정할 실을 먼저 선택하세요'); return }
    trySelectOutdoor(units, (sub) => {
      for (const g of sub.groups) {
        const meta = nextGroupMeta(repo.load())
        uc.add({ meta, outdoorUnit: g.outdoorUnit })
        for (const rid of g.roomIds) uc.reassign({ roomId: rid, to: meta.key })
      }
      // 선택 실들이 빠져 빈 그룹이 된 옛 실외기는 정리한다.
      cleanEmptyGroups()
      sync('실외기 선정')
      setSelRooms([])
      flash(`✦ 선택한 ${units.length}대 기준 실외기 ${sub.groups.length}대를 선정했습니다`)
    })
  }

  return { moveRoom, removeGroup, replaceModel, selectOutdoorForSelected }
}

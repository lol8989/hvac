// 선택된 실 → 우측 패널 카드 선택 인덱스 파생 + 수동 클릭(pick) 관리.
//  · liveSelRooms: 존재하는 실만(사라진 실 id가 남아 aiSelectionFor(undefined)로 터지는 것 방지 — 적대적 QA)
//  · effIn/effOut: 실외기=그룹 실제 모델, 실내기=배정값 우선·없으면 부하 근사 추천. pick(수동)이 있으면 덮어쓴다.
// selRooms·tab은 App이 소유하고(여러 곳에서 쓰인다) 입력으로 받는다. pick은 이 훅이 소유한다.
import { useMemo, useState } from 'react'
import { groupOfRoom, outdoorIdxByModel } from '../../data'
import type { ModelCard } from '../../data'
import { aiSelectionFor } from '../../domain/generation/recalc'
import type { IndoorModel } from '../../domain/generation/IndoorModel'
import type { Room as DomainRoom } from '../../domain/generation/Room'
import type { Placement } from '../../domain/generation/Placement'
import type { GroupView } from './planAdapter'

export interface SelectionCardsInput {
  selRooms: readonly string[]
  tab: 'in' | 'out'
  domainRooms: Record<string, DomainRoom>
  groups: GroupView[]
  outdoorCards: ModelCard[]
  indoorModels: readonly IndoorModel[]
  placements: Record<string, Placement>
}

export interface SelectionCards {
  liveSelRooms: string[]
  primary: string | undefined
  effIn: number
  effOut: number
  selectModel: (idx: number) => void
}

export function useSelectionCards(input: SelectionCardsInput): SelectionCards {
  const { selRooms, tab, domainRooms, groups, outdoorCards, indoorModels, placements } = input
  const [pick, setPick] = useState<{ in: number | null; out: number | null }>({ in: null, out: null })
  const [prevPrimary, setPrevPrimary] = useState<string | undefined>(undefined)

  const liveSelRooms = useMemo(() => selRooms.filter((id) => domainRooms[id]), [selRooms, domainRooms])
  const primary = liveSelRooms[0]

  // 실 선택이 바뀌면 수동 선택(pick)을 초기화 — 렌더 중 조정(effect·cascading 불필요).
  if (primary !== prevPrimary) {
    setPrevPrimary(primary)
    setPick({ in: null, out: null })
  }

  // 카드 선택 인덱스 파생: 실외기=그룹 실제 모델, 실내기=배정값 우선·없으면 부하 근사 추천.
  const grpOfPrimary = primary ? groupOfRoom(groups, primary) : null
  const derivedOutIdx = grpOfPrimary ? outdoorIdxByModel(grpOfPrimary.model, outdoorCards) : -1
  const appliedCode = primary ? placements[primary]?.effectiveSelection.modelCode : undefined
  const derivedInIdx = appliedCode
    ? Math.max(0, indoorModels.findIndex((m) => m.model === appliedCode))
    : primary
      ? indoorModels.findIndex((m) => m.model === aiSelectionFor(domainRooms[primary], indoorModels).modelCode)
      : -1 // 선택 실 없으면 아무 카드도 선택 안 함
  const effIn = pick.in ?? derivedInIdx
  const effOut = pick.out ?? derivedOutIdx

  // 장비 카드 선택(현재 탭 기준). 실 선택이 바뀌기 전까지 파생값을 덮어쓴다.
  const selectModel = (idx: number) => setPick((p) => ({ ...p, [tab]: idx }))

  return { liveSelRooms, primary, effIn, effOut, selectModel }
}

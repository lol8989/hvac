// 생성 파이프라인 스텝 전환 + 스텝 가드/확인 모달 + 파괴적 편집(시설군·천정고) 오케스트레이션.
//
// "다음 단계로 가도 되는가"(도메인 가드 판정)와 "무엇을 세는가"(buildGuardContext, 순수)와
// "화면에 어떻게 알리는가"(guard 모달)를 App.tsx가 한 덩어리로 들고 있었다(§5.8). 이 훅이
// 전환·판정 실행·모달 상태를 한 액터로 모은다. 판정 데이터는 순수 함수가 만들고 여기선 실행만 한다.
//
// step/setStep은 App이 소유한다(선택·탭처럼 화면 곳곳에서 가드 문맥보다 먼저 읽히는 뷰 상태) —
// useSelectionCards가 selRooms를 입력받은 것과 같은 이유. 이 훅은 전환 로직만 담당한다.
import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { guardAdvance, guardDestructive } from '../../domain/generation/StepGuard'
import type { StepId, GuardContext, GuardVerdict } from '../../domain/generation/StepGuard'
import { applyCeilingHeights } from '../../domain/generation/ceilingHeight'
import type { FacilityType } from '../../domain/shared/unitLoadTable'
import { planConfirmFlow } from './confirmEditFlow'
import type { World } from './world'
import type { Room as DomainRoom } from '../../domain/generation/Room'
import type { Polygon } from '../../domain/shared/Polygon'

// 팝업으로 띄우는 가드 판정(차단·확인). null = 닫힘. 2건 이상이면 confirms에 모아 한 모달로.
type ActiveGuard = {
  verdict: Extract<GuardVerdict, { kind: 'BLOCK' } | { kind: 'CONFIRM' }>
  proceed: () => void
  confirmLabel?: string
  confirms?: Extract<GuardVerdict, { kind: 'CONFIRM' }>[]
} | null

export interface GenerationStepsInput {
  step: StepId
  setStep: Dispatch<SetStateAction<StepId>>
  // 현재 상태의 가드 문맥(buildGuardContext로 App이 파생 — 매 렌더 최신값).
  guardCtx: GuardContext
  edit: (fn: (w: World) => World, label: string) => void
  setSelRooms: Dispatch<SetStateAction<string[]>>
  flash: (msg: string) => void
  // 시설군 변경 시 그 시설군의 단위부하로 실을 다시 시딩한다(목업 검출기 출력 재생성).
  reseedRooms: (f: FacilityType) => { rooms: Record<string, DomainRoom>; geom: Record<string, Polygon> }
}

export interface GenerationSteps {
  generated: boolean
  confirmed: boolean
  guard: ActiveGuard
  runGuarded: (verdict: GuardVerdict, proceed: () => void, confirmLabel?: string) => void
  acceptGuard: () => void
  dismissGuard: () => void
  onPickStep: (to: StepId) => void
  confirmEdit: () => void
  resumeEdit: () => void
  doGenerate: () => void
  changeFacility: (f: FacilityType) => void
  changeCeilingHeight: (floor: string, heightM: number) => void
}

export function useGenerationSteps(input: GenerationStepsInput): GenerationSteps {
  const { step, setStep, guardCtx, edit, setSelRooms, flash, reseedRooms } = input
  const [editReturn, setEditReturn] = useState<StepId>('outdoor') // 편집 재개 시 돌아갈 편집 도구(확정 직전 도구)
  const [generated, setGenerated] = useState(false)
  const [guard, setGuard] = useState<ActiveGuard>(null)

  // 편집 확정: 산출물 단계 진입 = 확정. 확정되면 편집을 잠가 산출물을 고정한다('편집 재개'로 되열 수 있다).
  const confirmed = step === 'output'

  // 단건 판정(파괴적 편집)을 실행한다. ALLOW면 즉시 진행, 아니면 팝업을 띄운다.
  const runGuarded = (verdict: GuardVerdict, proceed: () => void, confirmLabel?: string) => {
    if (verdict.kind === 'ALLOW') { proceed(); return }
    setGuard({ verdict, proceed, confirmLabel })
  }

  // 문제 **목록**을 실행한다. 없으면 즉시 진행, BLOCK이면 막고, CONFIRM은 전부 모아 한 모달로.
  // 결정은 planConfirmFlow(순수)가 하고 여기는 그 결정을 화면 상태로 옮기기만 한다(§5.6).
  const runGuardedAll = (problems: readonly GuardVerdict[], proceed: () => void) => {
    const flow = planConfirmFlow(problems)
    if (flow.kind === 'proceed') { proceed(); return }
    if (flow.kind === 'block') { setGuard({ verdict: flow.verdict, proceed }); return } // 모달만 뜨고 진행하지 않는다
    setGuard({ verdict: flow.confirms[0], proceed, confirms: flow.confirms })
  }
  const acceptGuard = () => {
    if (!guard) return
    const p = guard.proceed
    setGuard(null)
    p()
  }
  const dismissGuard = () => setGuard(null)

  // 편집 확정: 세 편집 단계의 전제를 한 번에 검사한다(place→combine→outdoor 순). BLOCK이면 막고,
  // CONFIRM이면 확인 후 산출물로. 확정되면 편집이 잠긴다(Viewer 콜백 차단). '편집 재개'로 되열 수 있다.
  const confirmEdit = () => {
    // 세 단계의 문제를 전부 모은다. 한 단계가 확인 2건을 내도 그대로 실린다(스텝 안·밖 모두 병합).
    const problems = (['place', 'combine', 'outdoor'] as StepId[]).flatMap((s) => guardAdvance(s, guardCtx))
    runGuardedAll(problems, () => { setEditReturn(step); setStep('output') })
  }
  const resumeEdit = () => setStep(editReturn) // 편집 재개 — 잠금 해제하고 확정 직전 도구로 복귀
  // 인디케이터/도구 선택: 편집 도구는 자유 전환, '산출물'은 편집 확정 게이트로.
  const onPickStep = (to: StepId) => { if (to === 'output') confirmEdit(); else setStep(to) }

  const doGenerate = () =>
    runGuardedAll(guardAdvance('output', guardCtx), () => {
      setGenerated(true)
      flash('장비선정표·장비일람표·도면 산출물을 생성했습니다')
    })

  // 시설군 변경: 단위부하의 전제가 바뀐다 → 그 시설군으로 실을 다시 시딩하고 배치·조합은 초기화한다.
  // 배치가 있으면 무엇을 잃는지 확인을 받는다. (실내기 배치 단계에 그대로 머문다)
  const changeFacility = (f: FacilityType) =>
    runGuarded(guardDestructive('FACILITY_CHANGE', guardCtx), () => {
      // 재시딩은 부하강도를 STANDARD로 되돌린다 → 이미 입력된 천정고를 다시 얹어야
      // "4m 층인데 표준부하"라는 어긋난 상태가 안 남는다.
      edit((w) => ({
        ...w,
        facility: f,
        ...(({ rooms, geom }) => ({ rooms: applyCeilingHeights(rooms, w.ceilingHeights), geom }))(reseedRooms(f)),
        placements: {},
        outdoorPositions: {},
      }), '시설군 변경')
      setSelRooms([])
    }, '시설군 변경')

  // 천정고 변경: 4m 이상이면 특수부하 → 그 층 실들의 단위부하가 올라간다.
  // 시설군 변경과 달리 실을 재시딩하지 않는다(형상·실명·사용자 수정은 그대로) —
  // 바뀌는 것은 부하강도뿐이고, 실내기 선정 변동은 그 부하를 타고 따라온다.
  const changeCeilingHeight = (floor: string, heightM: number) =>
    runGuarded(guardDestructive('CEILING_HEIGHT_CHANGE', guardCtx), () => {
      edit((w) => {
        const ceilingHeights = { ...w.ceilingHeights, [floor]: heightM }
        return { ...w, ceilingHeights, rooms: applyCeilingHeights(w.rooms, ceilingHeights) }
      }, '천정고 변경')
      flash(`${floor} 천정고를 ${heightM}m로 바꿨습니다. 실내기를 다시 배치하면 새 부하가 반영됩니다.`)
    }, '천정고 변경')

  return {
    generated, confirmed, guard, runGuarded, acceptGuard, dismissGuard,
    onPickStep, confirmEdit, resumeEdit, doGenerate, changeFacility, changeCeilingHeight,
  }
}

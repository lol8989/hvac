import { useState, useMemo, useEffect, useRef } from 'react'
import { ROOMS, CURRENT_USER, GNB_MENUS, ACTIVE_MENU, groupOfRoom, DEFAULT_FACILITY } from './data'
import { canManageEquipment } from './domain/auth/Permission'
import type { ModelCard, Room } from './data'
import Viewer, { type LayerVisibility, ALL_LAYERS_ON, type ViewerHandle } from './components/Viewer'
import type { UnitSym } from './components/viewer/geometry'
import { buildScheduleSheets } from './presentation/generation/scheduleTable'
import { downloadScheduleXlsx } from './presentation/generation/scheduleXlsx'
import { EMPTY_SPEC_REPOSITORY, type EquipmentSpecRepository } from './application/equipment/specPorts'
import { buildDrawingSvg } from './presentation/generation/drawingSvg'
import { downloadText, CSV_BOM } from './presentation/download'
import ModelPanel from './components/ModelPanel'
import MappingDock from './components/generation/MappingDock'
import { buildDockView } from './presentation/generation/dockView'
import { roomColorMap } from './presentation/generation/groupColors'
import { usePersistentPanel } from './presentation/generation/usePersistentPanel'
import { useUndoRedoShortcuts } from './presentation/generation/useUndoRedoShortcuts'
import ConfirmModal from './components/ConfirmModal'
import ProjectSettings from './components/steps/ProjectSettings'
import CeilingHeightsPanel from './components/steps/CeilingHeights'
import GuardModal from './components/generation/GuardModal'
import WorkBar from './components/generation/WorkBar'
import StatusBar from './components/generation/StatusBar'
import OverflowMenu from './components/generation/OverflowMenu'
import PanelShell from './components/generation/PanelShell'
import OutdoorPanel from './components/generation/panels/OutdoorPanel'
import OutputPanel from './components/generation/panels/OutputPanel'
import type { FacilityType } from './domain/shared/unitLoadTable'
import { guardDestructive } from './domain/generation/StepGuard'
import type { StepId } from './domain/generation/StepGuard'
import { buildGuardContext } from './presentation/generation/guardContext'
import { useGenerationSteps } from './presentation/generation/useGenerationSteps'
import { InMemoryPlanRepository } from './infrastructure/generation/InMemoryPlanRepository'
import { InMemoryOutdoorModelCatalog } from './infrastructure/generation/InMemoryOutdoorModelCatalog'
import { makeReassignRoom } from './application/generation/ReassignRoom'
import { makeReplaceOutdoorModel } from './application/generation/ReplaceOutdoorModel'
import { makeAddGroup, makeRemoveGroup } from './application/generation/GroupCommands'
import { bootstrapPlan, toViewModel } from './presentation/generation/planAdapter'
import { compatPredicateFromMatrix } from './presentation/generation/compatPredicate'
import { usePlanCommands } from './presentation/generation/usePlanCommands'
import { useIndoorPlacement } from './presentation/generation/useIndoorPlacement'
import { compatMatrixFromSeed } from './infrastructure/equipment/seed/compatMatrixFromSeed'
import type { CompatMatrix } from './domain/equipment/CompatMatrix'
import { useFloorView } from './presentation/generation/useFloorView'
import { useSelectionCards } from './presentation/generation/useSelectionCards'
import { splitPlacementAcrossChildren, mergePlacements, reshapeRoom } from './domain/generation/roomShapeEdit'
import { DomainError } from './domain/generation/errors'
import { Room as DomainRoom } from './domain/generation/Room'
import { Placement } from './domain/generation/Placement'
import { applyAiPlacement, placementTotalsW, aiSelectionFor } from './domain/generation/recalc'
import { Polygon, sharedEdgeLength, NotAdjacentError } from './domain/shared/Polygon'
import type { Pt } from './domain/shared/Polygon'
import { sliceRoom, SliceMissedRoomError, TooThinSliceError, SliceProducesManyPiecesError } from './domain/generation/sliceRoom'
import { mergeRooms } from './domain/generation/mergeRooms'
import type { SliceLine } from './components/Viewer'
import { planScaleOf, scalePoints, worldLineToBase } from './presentation/generation/planScale'
import { checkClearances } from './domain/generation/clearanceRules'
import { UnitLoad } from './domain/shared/UnitLoad'
import { InMemoryIndoorModelCatalog } from './infrastructure/generation/InMemoryIndoorModelCatalog'
import { defaultEquipmentMaster } from './infrastructure/equipment/InMemoryEquipmentMaster'
import type { EquipmentMaster } from './domain/equipment/EquipmentMaster'
import { buildSelectionTable } from './domain/generation/SelectionTable'
import { buildSelectionCsv } from './presentation/generation/selectionCsv'
import { useUndoableWorld } from './presentation/generation/useUndoableWorld'
import { useSyncedPlanRepo } from './presentation/generation/useSyncedPlanRepo'
import { useSelectionSync } from './presentation/generation/useSelectionSync'
import { useScheduleSync } from './presentation/generation/useScheduleSync'
import { useTileManifest } from './presentation/generation/useTileManifest'

// 목업 검출기(ROOMS)의 출력을 도메인 Room·형상으로 시딩한다.
// 실 검출은 더 이상 별도 스텝이 아니다 — 도면을 열면 실이 이미 검출된 상태로 시작하고,
// 시설군을 바꾸면 그 시설군의 단위부하로 실을 다시 시딩한다(둘 다 이 함수를 쓴다).
function seedDetectedRooms(facility: FacilityType): { rooms: Record<string, DomainRoom>; geom: Record<string, Polygon> } {
  const rooms = Object.fromEntries(
    Object.entries(ROOMS).map(([id, r]) => [
      id,
      DomainRoom.create({ id, floor: r.floor, name: r.name, areaM2: r.area, usage: r.usage, facility, shortSideM: r.shortSideM, longSideM: r.longSideM }),
    ]),
  )
  // 형상(SSOT)도 함께 시딩한다 — 이후 편집(자르기·리사이즈)이 이 값을 고친다.
  const geom = Object.fromEntries(Object.entries(ROOMS).map(([id, r]) => [id, Polygon.of(r.points)]))
  return { rooms, geom }
}

export default function App({
  master = defaultEquipmentMaster,
  // 롱테일 스펙(일람표 컬럼). SQLite가 없으면 빈 저장소 → 일람표 셀이 '-'로 남는다.
  specRepository = EMPTY_SPEC_REPOSITORY,
  // 실내기↔실외기 호환 기준표. 실외기 선정이 이 표를 따른다(없으면 계열로 폴백).
  // 기본은 현업 확정 시드. 프로덕션은 main.tsx가 시드+관리자 override를 주입한다.
  compatMatrix = compatMatrixFromSeed(),
}: { master?: EquipmentMaster; specRepository?: EquipmentSpecRepository; compatMatrix?: CompatMatrix } = {}) {
  // 컴포지션 루트: 장비마스터(SSOT)를 주입받고, 실내기·실외기 카탈로그가 이를 참조(PUBLISHED만)한다.
  // 프로덕션은 main.tsx가 SQLite 백엔드 마스터를 주입, 미주입 시 인메모리 기본(테스트·폴백).
  // 배정 상태는 도메인 AssignmentPlan이 소유하고, 리포지토리 포트로 유즈케이스가 로드/저장한다.
  // 모두 세션 1개로 고정(useState lazy).
  const [catalog] = useState(() => new InMemoryOutdoorModelCatalog(master))
  const [repo] = useState(() => new InMemoryPlanRepository(bootstrapPlan()))
  // 실외기 선정 호환 판정 — 조합표(시리즈×유형) 기반, 없는 축은 계열로 폴백.
  const [isOutdoorCompatible] = useState(() => compatPredicateFromMatrix(compatMatrix))
  // 실내기 모델 카탈로그(장비마스터 PUBLISHED 참조, 장비번호 코드 기반).
  const [indoorCatalog] = useState(() => new InMemoryIndoorModelCatalog(master))
  const indoorModels = useMemo(() => indoorCatalog.list(), [indoorCatalog])
  // 실외기 도면 표기는 장비번호가 아니라 **마력**이다(0708 회의록, 주인님 확인 2026-07-20).
  // 마력은 도메인 OutdoorUnit이 아니라 카탈로그 스펙에 있으므로 표시 계층에서 모델로 조인한다.
  const hpByModel = useMemo(() => new Map(catalog.list().map((s) => [s.model, s.hp] as const)), [catalog])

  // ── 편집 상태(World) ──
  // 생성 파이프라인의 편집 상태를 하나로 묶는다. 되돌리기(Ctrl+Z)가 원자적이려면
  // 스냅샷도 원자적이어야 한다 — 실을 자르면 실·형상·배치가 함께 바뀌고, 함께 돌아와야 한다.
  //  · rooms  : 도메인 Room(층·실명·면적·용도·단위부하) — 선정표 그리드가 편집하는 SSOT
  //  · geom   : 실의 형상(베이스 720×470 좌표 폴리곤) — 목업 ROOMS는 'AI 검출기의 출력'일 뿐이라
  //             자르기로 태어난 새 실(AC_001-1 …)의 좌표를 담을 자리가 없다
  //  · placements : 실별 실내기 배치(모델·대수·좌표) — 대수 SSOT는 도면 심볼이다
  //  · outdoorPositions : 실외기 심볼 좌표(그룹 key → 좌표)
  //  · plan   : 실외기 조합·배정(AssignmentPlan)
  //  · facility : 시설군(단위부하의 전제)
  // 초기 화면부터 실이 검출돼 있다 — 검출 스텝을 없앴으므로 로드 시점에 실·형상을 시딩한다.
  // 편집 상태(World) 되돌리기 토대 + 부분 편집 헬퍼를 한 훅으로 묶는다(§5.7).
  // 사용자의 편집 1회 = 커밋 1회(= Ctrl+Z 1회). 파생 동기화는 replace(히스토리 미기록).
  const {
    world, edit, replace, editPlacements, editOutdoorPositions,
    undo, redo, canUndo, canRedo, undoLabel, redoLabel,
  } = useUndoableWorld(
    () => ({ plan: repo.load(), ...seedDetectedRooms(DEFAULT_FACILITY), placements: {}, outdoorPositions: {}, facility: DEFAULT_FACILITY, ceilingHeights: {} }),
  )
  const { plan, rooms: domainRooms, geom: roomGeom, placements, outdoorPositions, facility, ceilingHeights } = world

  const [selRooms, setSelRooms] = useState<string[]>([]) // 초기엔 선택 없음(뱃지·하이라이트 없음)
  const [tab, setTab] = useState<'in' | 'out'>('in')
  // 카드 선택은 기본적으로 대표 실에서 '파생'(실외기=그룹 모델, 실내기=배정/추천)한다.
  // 사용자가 카드를 직접 클릭하면 pick으로 그 파생을 덮어쓰고, 실 선택이 바뀌면 초기화한다.
  // 우측 패널 실내기 카드 — 실내기 카탈로그(장비번호 코드)에서 파생.
  const indoorCards = useMemo<ModelCard[]>(
    () =>
      indoorModels.map((m) => ({
        mn: m.model,
        // 2행에는 모델·장비번호를 반복하지 않는다(1행 모델명 + 시리즈로 식별). 실데이터는 code=model이라 중복 표기였다.
        ms: `${m.type} · 냉방 ${(m.coolW / 1000).toFixed(1)}kW · 난방 ${(m.heatW / 1000).toFixed(1)}kW`,
        md: '',
        on: false,
        cool: m.coolW / 1000,
        kind: m.type,
        series: m.series,
      })),
    [indoorModels],
  )

  // 우측 패널 실외기 카드 — 장비마스터의 PUBLISHED 실외기 카탈로그에서 파생(더 이상 목업 MODELS.out 아님).
  const outdoorCards = useMemo<ModelCard[]>(
    () =>
      catalog.list().map((s) => ({
        mn: s.model,
        ms: `${s.category} · 냉방 ${s.capacityKw.toFixed(1)}kW${s.heatKw ? ` · 난방 ${s.heatKw.toFixed(1)}kW` : ''} · ${s.hp}HP`,
        md: `최대 연결 ${s.maxConnections}대`, // 시리즈는 1행(모델명 옆)에서 표기 — 중복 금지
        on: false,
        cool: s.capacityKw,
        kind: s.category,
        sys: s.energySource,
        heat: s.heatKw,
        series: s.series,
      })),
    [catalog],
  )

  // ── placements 파생값들 (실내기 선정 SSOT → 레거시 컴포넌트 뷰) ──
  // 실별 적용 실내기 모델명(도면 SVG·장비일람표용).
  const indoorByRoom = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        Object.entries(placements).map(([id, p]) => [id, indoorCatalog.byCode(p.effectiveSelection.modelCode)?.model ?? p.effectiveSelection.modelCode]),
      ),
    [placements, indoorCatalog],
  )
  // AI가 선정(오버라이드 없음)한 실 — 목록 'AI' 뱃지용.
  const aiRooms = useMemo(() => new Set(Object.keys(placements).filter((id) => !placements[id].isOverridden)), [placements])

  // 실별 실내기 설치용량(kW, 정격×대수) — 조합 리포트/조합비의 'B: 선택 장비 기준' 산정용. 미배치는 0.
  const indoorCapByRoom = useMemo(() => {
    const map: Record<string, number> = {}
    for (const id of Object.keys(domainRooms)) {
      const p = placements[id]
      map[id] = p ? placementTotalsW(p, indoorModels).coolW / 1000 : 0
    }
    return map
  }, [placements, domainRooms, indoorModels])

  // 실별 실내기 표시정보(모델명·유형) — 도면 심볼 오버레이용. 배치값 우선, 없으면 부하 기반 추천.
  const indoorInfo = useMemo(() => {
    const map: Record<string, { model: string; kind: string }> = {}
    for (const id of Object.keys(domainRooms)) {
      const code = placements[id]?.effectiveSelection.modelCode ?? aiSelectionFor(domainRooms[id], indoorModels).modelCode
      const m = indoorCatalog.byCode(code)
      map[id] = m ? { model: m.model, kind: m.type } : { model: code, kind: '' }
    }
    return map
  }, [placements, domainRooms, indoorCatalog, indoorModels])

  // 뷰용 실 정보: 형상은 roomGeom(SSOT), 실명·면적·부하는 도메인 Room에서 파생(그리드 편집·자르기 반영).
  // 검출된 실(domainRooms)만 순회 — 검출 전에는 빈 객체라 뷰어·리포트가 0/빈 상태가 된다.
  // 표시용 태그(type·sys)는 목업 검출기 출력에서 가져온다. 잘린 실은 부모(AC_001-2 → AC_001)의 것을 쓴다.
  const viewRooms = useMemo<Record<string, Room>>(
    () =>
      Object.fromEntries(
        Object.entries(domainRooms).map(([id, dr]) => {
          const src = ROOMS[id] ?? ROOMS[id.split('-')[0]]
          const g = roomGeom[id]
          const room: Room = {
            name: dr.name,
            floor: dr.floor,
            usage: dr.usage,
            area: dr.areaM2,
            shortSideM: dr.shortSideM,
            longSideM: dr.longSideM,
            corridor: src?.corridor,
            type: src?.type ?? '',
            // kW 원값(반올림하지 않는다) — 표시할 때 자릿수를 맞춘다.
            // 실별 반올림값을 더하면 자를수록 총합이 흘러내린다(적대적 QA).
            cool: dr.requiredLoadW.cool / 1000,
            sys: src?.sys ?? 'EHP',
            points: g ? g.points : [],
          }
          return [id, room]
        }),
      ),
    [domainRooms, roomGeom],
  )
  // 우측 패널 접힘/폭은 localStorage에 유지(새로고침 후에도 복원).
  const { open: panelOpen, setOpen: setPanelOpen, width: panelW, setWidth: setPanelW } = usePersistentPanel()
  // 실외기 심볼 좌표(그룹 key → 좌표). 도면에 놓였는지 여부가 곧 '배치 완료' 여부다.
  const [mapOpen, setMapOpen] = useState(false)
  const [dockH, setDockH] = useState(300) // 조합 매핑 도크 높이(드래그로 조절)
  const [layers, setLayers] = useState<LayerVisibility>(ALL_LAYERS_ON) // 레이어별 표시 토글 → 뷰어
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null) // 모델 적용 확인 팝업 메시지(null=닫힘)
  const [toast, setToast] = useState('')
  const viewerRef = useRef<ViewerHandle>(null) // 'AI 실내기 배치' 명령용

  // 생성 파이프라인 진행 단계(상태머신). editReturn·generated·guard 모달은 useGenerationSteps가 소유한다.
  const [step, setStep] = useState<StepId>('place') // 편집 도구(실내기/실외기 선정·조합/실외기 배치) 또는 'output'(산출물)
  // 사용자가 실외기를 삭제해 그룹을 비웠으면 자동 선정을 억제한다(그룹 0 → 재선정 방지).
  // 실내기를 재배치하면 새 시작이라 해제한다.
  const suppressAutoSelectRef = useRef(false)

  // 실제 도면: Python(ezdxf)로 전처리한 딥줌 타일 피라미드. 좌표계 정합의 토대.
  const { tiles, planDims } = useTileManifest()

  // 베이스(목업 720×470) → 도면(실도면 DXF 월드) 축척. 타일이 없으면 1:1.
  const scale = useMemo(() => planScaleOf(planDims), [planDims])

  // 실 형상을 도면 좌표로 스케일(도면 위 앵커링). 용량·이름 등은 유지.
  const worldRooms = useMemo(() => {
    if (!planDims) return viewRooms
    return Object.fromEntries(
      Object.entries(viewRooms).map(([id, r]) => [id, { ...r, points: scalePoints(r.points, scale) }] as const),
    )
  }, [planDims, viewRooms, scale])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  // 실내기 배치(placements) 편집 커맨드 + 좌표 어댑터(layoutFor)·유닛 파생(unitsFrom)을 한 훅으로 묶는다.
  // 도면 심볼 1개 = 실내기 1대 = 선정표 대수 1(불변식). 대수의 SSOT는 심볼이고 이 커맨드가 그것을 고친다(§5.8).
  const {
    layoutFor, unitsFrom, indoorSymbols, aiPlace,
    moveUnits, rotateUnits, deleteUnits, addUnitToRoom, overrideIndoor, resetIndoor,
  } = useIndoorPlacement({
    worldRooms, domainRooms, indoorCatalog, indoorModels, placements,
    editPlacements, flash, suppressAutoSelectRef,
  })

  // 유즈케이스(포트 DI). 리포지토리가 고정이라 1회 생성.
  const uc = useMemo(
    () => ({
      reassign: makeReassignRoom({ planRepository: repo }),
      replace: makeReplaceOutdoorModel({ planRepository: repo }),
      add: makeAddGroup({ planRepository: repo }),
      remove: makeRemoveGroup({ planRepository: repo }),
    }),
    [repo],
  )
  // 실외기 조합(AssignmentPlan) 편집 커맨드 + 자동선정 이펙트를 한 훅으로 묶는다.
  // 선정·재배정·삭제·모델교체가 리포지토리·플랜·undo를 함께 만지던 것을 App 밖으로 낸다(§5.8).
  const { moveRoom, removeGroup, replaceModel, selectOutdoorForSelected } = usePlanCommands({
    repo, uc, catalog, isOutdoorCompatible, plan, domainRooms, placements,
    unitsFrom, step, suppressAutoSelectRef,
    edit, replace, setSelRooms, flash,
  })

  // 플랜 ↔ 리포지토리 ↔ 배치 정렬 동기(§5.7 결정 #2). 두 repo-쓰기 이펙트를 한 곳에서 순서 고정.
  useSyncedPlanRepo({ repo, plan, placements, domainRooms, unitsFrom, replace })

  // 컴포넌트가 소비하는 레거시 뷰 형태로 변환(동작 보존).
  const { groups, pool } = toViewModel(plan)

  // 대표 실(헤더/모델 파생 기준). 실내기 목록에서 새로 켠 실이 맨 앞으로 승격된다.
  //
  // 사라진 실(자르기·시설군 재시딩으로 없어진 id)이 선택에 남아 있으면 domainRooms[primary]가 undefined가 되고
  // aiSelectionFor(undefined)가 렌더 중 터져 화면이 통째로 죽는다(적대적 QA) → 존재하는 실만 본다.
  const { liveSelRooms, primary, effIn, effOut, selectModel } = useSelectionCards({
    selRooms, tab, domainRooms, groups, outdoorCards, indoorModels, placements,
  })

  // 우측 패널 실내기 목록에서 실을 클릭하면 선택에 토글. 새로 켠 실은 맨 앞에 두어
  // 대표 실(selRooms[0], 헤더 표시)로 승격 → 헤더(실ID/이름/면적)가 즉시 갱신된다.
  const toggleRoom = (id: string) => {
    setSelRooms((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]))
  }

  // 실을 대표(맨 앞)로 승격 — 선택 유지, 헤더/추천 모델이 그 실로 이동.
  const focusRoom = (id: string) => {
    setSelRooms((prev) => [id, ...prev.filter((x) => x !== id)])
  }


  // '모델 적용' 클릭 → 유효성 검사 후 확인 팝업을 띄운다(일괄 적용 전 주의). 탭별로 나뉜다.
  const requestApplyIndoor = () => {
    const m = indoorCards[effIn]
    if (!m) return
    if (liveSelRooms.length === 0) { flash('적용할 실을 먼저 선택하세요'); return }
    const scope = liveSelRooms.length > 1 ? `${primary} 외 ${liveSelRooms.length - 1}실` : primary
    setConfirmMsg(`실내기 ${m.mn}을(를) 선택한 ${scope}에 일괄 적용합니다. 계속하시겠습니까?`)
  }
  const requestApplyOutdoor = () => {
    const m = outdoorCards[effOut]
    if (!m) return
    const g = primary ? groupOfRoom(groups, primary) : null
    if (!g) { flash('선택한 실이 실외기 그룹에 배정되어 있지 않습니다'); return }
    setConfirmMsg(`${g.label}의 실외기 모델을 ${m.mn}(으)로 교체합니다. 계속하시겠습니까?`)
  }
  const requestApply = () => (tab === 'in' ? requestApplyIndoor() : requestApplyOutdoor())

  // 선택 모델을 선택 실에 적용(쓰기). 팝업 확인 후 실행. 탭별로 나뉜다.
  //  · 실내기: 선택된 모든 실에 모델을 배정 → 목록/헤더에 반영(수동 적용은 AI 재선정에도 보존되는 오버라이드).
  const applyIndoorModel = () => {
    const m = indoorCards[effIn]
    if (!m) return
    if (liveSelRooms.length === 0) { flash('적용할 실을 먼저 선택하세요'); return }
    const model = indoorCatalog.byModel(m.mn)
    if (!model) { flash('카탈로그에 없는 실내기 모델입니다'); return }
    // 수동 적용 = 사용자 오버라이드(AI 재선정에도 보존). 대수는 기존 값 유지, 최초면 1.
    editPlacements(`실내기 모델 적용(${m.mn})`, (prev) => {
      const next = { ...prev }
      liveSelRooms.forEach((id) => {
        const sel = { modelCode: model.model, quantity: prev[id]?.effectiveSelection.quantity ?? 1 }
        // 모델만 바뀌고 대수는 그대로 → 심볼 좌표도 그대로.
        const positions = prev[id] ? [...prev[id].positions] : layoutFor(id, sel.quantity)
        next[id] = (prev[id] ?? Placement.ai(id, sel, positions)).overrideSelection(sel, positions)
      })
      return next
    })
    const scope = liveSelRooms.length > 1 ? `${primary} 외 ${liveSelRooms.length - 1}실` : primary
    flash(`실내기 ${m.mn}을(를) ${scope}에 적용했습니다`)
  }
  //  · 실외기: 대표 실이 속한 그룹의 실외기를 실제 교체(도메인 유즈케이스 재사용).
  const applyOutdoorModel = () => {
    const m = outdoorCards[effOut]
    if (!m) return
    const g = primary ? groupOfRoom(groups, primary) : null
    if (!g) { flash('선택한 실이 실외기 그룹에 배정되어 있지 않습니다'); return }
    const spec = catalog.list().find((s) => s.model === m.mn)
    if (!spec) { flash('카탈로그에 없는 실외기 모델입니다'); return }
    replaceModel(g.key, spec) // 유즈케이스가 계열 불일치 처리 + 자체 토스트
  }
  const applyModel = () => (tab === 'in' ? applyIndoorModel() : applyOutdoorModel())

  // ── 실외기 심볼(도면 좌표) ──
  const outdoorSymbols = useMemo<UnitSym[]>(
    () =>
      Object.entries(outdoorPositions).map(([key, p]) => ({ id: key, x: p.x, y: p.y, rot: 0 })),
    [outdoorPositions],
  )
  const moveOutdoors = (moves: { id: string; x: number; y: number }[]) =>
    editOutdoorPositions('실외기 이동', (prev) => {
      const next = { ...prev }
      for (const m of moves) if (next[m.id]) next[m.id] = { x: m.x, y: m.y }
      return next
    })
  const deleteOutdoors = (keys: string[]) =>
    editOutdoorPositions('실외기 삭제', (prev) => {
      const next = { ...prev }
      for (const k of keys) delete next[k]
      return next
    })
  // 자동 배치: 활성 그룹만 도면 하단에 나열한다.
  const autoPlaceOutdoors = (positions: Record<string, { x: number; y: number }>) => {
    editOutdoorPositions('실외기 배치', positions)
    flash(`실외기 ${Object.keys(positions).length}대를 도면에 배치했습니다`)
  }
  // 그룹이 사라지면 그 좌표도 지운다(삭제·재선정으로 key가 바뀔 수 있다).
  useEffect(() => {
    const alive = new Set(plan.groups.map((g) => g.key))
    replace((w) => {
      const kept = Object.keys(w.outdoorPositions).filter((k) => alive.has(k))
      if (kept.length === Object.keys(w.outdoorPositions).length) return w
      return { ...w, outdoorPositions: Object.fromEntries(kept.map((k) => [k, w.outdoorPositions[k]])) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  // ── 선정표 그리드 편집 핸들러: 상류 수정 → 하류(AI 선정·조합비) 재계산 ──
  // 편집 커맨드는 새 창(BroadcastChannel)에서도 온다 → 사라진 실(자르기·시설군 재시딩)을 가리킬 수 있다.
  // 신뢰 경계를 넘어오는 id는 반드시 존재를 확인한다(적대적 QA).
  const updateRoom = (id: string, fn: (r: DomainRoom) => DomainRoom, label = '실 정보 수정') => {
    if (!domainRooms[id]) return
    const nextRooms = { ...domainRooms, [id]: fn(domainRooms[id]) }
    // 부하가 바뀌면 AI 선정도 재계산(오버라이드는 보존). 배치 전에는 건드리지 않는다.
    const nextPlacements = Object.keys(placements).length
      ? applyAiPlacement(Object.values(nextRooms), placements, indoorModels, layoutFor)
      : placements
    edit((w) => ({ ...w, rooms: nextRooms, placements: nextPlacements }), label)
  }
  const renameRoom = (id: string, name: string) => {
    try { updateRoom(id, (r) => r.rename(name), '실명 변경') } catch { flash('실명은 비워둘 수 없습니다') }
  }
  const overrideUnitLoad = (id: string, coolKcal: number, heatKcal: number) => {
    try { updateRoom(id, (r) => r.overrideUnitLoad(new UnitLoad(coolKcal, heatKcal)), '단위부하 수정') } catch { flash('단위부하는 0보다 큰 숫자여야 합니다') }
  }
  const resetUnitLoad = (id: string) => updateRoom(id, (r) => r.clearUnitLoadOverride(), '단위부하 초기화')
  // 조합 매핑에서 단위부하(kcal/h·㎡)를 직접 고친다 — 실제 입력값. 부하(kW)는 면적으로 자동 재계산된다.
  // 난방 단위부하는 보존한다(냉방만 편집).
  const overrideRoomCoolKcal = (id: string, coolKcal: number) => {
    if (!(coolKcal > 0)) { flash('단위부하는 0보다 큰 숫자여야 합니다'); return }
    try {
      updateRoom(id, (r) => r.overrideUnitLoad(new UnitLoad(coolKcal, r.effectiveUnitLoad.heatKcal)), '단위부하 수정')
    } catch { flash('단위부하는 0보다 큰 숫자여야 합니다') }
  }
  const moveRoomFromGrid = (id: string, to: string) => {
    const cur = groupOfRoom(groups, id)?.key ?? 'pool'
    if (cur === to) return
    if (!moveRoom(id, to)) flash('계열이 호환되지 않거나 최대 연결 수를 초과해 이동할 수 없습니다')
  }

  // 장비선정표(행=실, 층합계, BOM) — 도메인 빌더로 매 렌더 파생(실 6개 규모라 저렴).
  const selectionTable = buildSelectionTable({
    rooms: Object.values(domainRooms),
    placements,
    groups: groups.map((g) => ({ key: g.key, label: g.label, model: g.model, hp: hpByModel.get(g.model), items: g.items })),
    indoorModels,
    outdoorSpecs: catalog.list().map((s) => ({ model: s.model, coolKw: s.capacityKw, heatKw: s.heatKw, hp: s.hp, comboRange: s.comboRange })),
  })

  // 조합 매핑 도크 뷰: 층 → 실외기 → 실(면적·칼로리·부하·모델·대수). 도메인(SelectionTable)이 이미 계산한 값을 옮긴다.
  const dockFloors = useMemo(() => buildDockView(selectionTable), [selectionTable])
  const dockUnassigned = useMemo(() => dockFloors.flatMap((f) => f.unassigned), [dockFloors])
  // 실 id → 실외기 그룹 색상(도크 탭 색과 동일 SSOT). 그룹을 다루는 단계(조합·실외기 배치)에서만
  // 도면 방/실내기를 색칠한다 — 실내기 배치 단계는 아직 조합이 관심사가 아니라 무채색으로 둔다.
  const roomColors = useMemo(
    () => (step === 'combine' || step === 'outdoor' ? roomColorMap(dockFloors) : {}),
    [step, dockFloors],
  )

  // 장비일람표 시트(계열별) — 다운로드와 '새 창' 미리보기가 같은 값을 본다.
  //
  // specsOf()는 SQLite 쿼리다. memo를 벗기면 렌더마다 1,206모델 테이블을 훑는다.
  // React Compiler가 이 memo를 보존하지 못한다고 경고하지만, 쿼리 비용이 훨씬 크다.
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const scheduleSheets = useMemo(() => {
    const bom = selectionTable.bom
    const models = [...bom.indoor.map((b) => b.model), ...bom.outdoor.map((b) => b.model)]
    return buildScheduleSheets({
      indoorBom: bom.indoor,
      outdoorBom: bom.outdoor,
      indoorModels,
      outdoorSpecs: catalog.list(),
      specs: specRepository.specsOf(models),
    })
  }, [selectionTable, indoorModels, catalog, specRepository])
  /* eslint-enable react-hooks/preserve-manual-memoization */

  // ── 산출물 '새 창' 동기화 ── 선정표는 양방향(편집), 일람표는 읽기 전용.
  useSelectionSync(
    {
      type: 'table',
      table: selectionTable,
      groupOptions: groups.map((g) => ({ key: g.key, label: g.label })),
      indoorModelOptions: indoorModels.map((m) => ({ code: m.model })),
    },
    { renameRoom, overrideUnitLoad, resetUnitLoad, overrideIndoor, resetIndoor, moveRoomFromGrid },
    [domainRooms, placements, plan],
  )
  useScheduleSync(scheduleSheets)

  // 선정표 새 창 열기 — 이름 있는 창이라 반복 클릭 시 같은 창을 재사용한다.
  const openSelectionWindow = () => {
    window.open(`${window.location.pathname}?view=selection`, 'poc-selection-window', 'width=1480,height=860')
  }

  // 일람표 새 창 열기 — 컬럼이 24~31개라 도면 화면 안에서는 볼 수 없다.
  const openScheduleWindow = () => {
    window.open(`${window.location.pathname}?view=schedule`, 'poc-schedule-window', 'width=1480,height=860')
  }

  // 장비일람표(xlsx, 계열별 시트) — 선정 BOM + 카탈로그 hot 필드 + 롱테일 스펙 조인.
  const downloadSchedule = () => {
    if (!scheduleSheets.length) { flash('다운로드할 결과가 없습니다 — 실내기 배치·조합을 먼저 진행하세요'); return }
    void downloadScheduleXlsx(scheduleSheets).then(() => {
      const rows = scheduleSheets.reduce((n, s) => n + s.rows.length, 0)
      flash(`장비일람표.xlsx를 생성했습니다 (시트 ${scheduleSheets.length} · ${rows}행)`)
    })
  }
  // 장비선정표(행=실, 층합계·BOM 포함) — 표준 260415 엑셀 양식의 CSV 직렬화.
  const downloadSelection = () => {
    if (!Object.keys(placements).length) { flash('다운로드할 선정 결과가 없습니다 — 실내기 배치를 먼저 진행하세요'); return }
    downloadText('장비선정표.csv', CSV_BOM + buildSelectionCsv(selectionTable), 'text/csv;charset=utf-8')
    flash('장비선정표.csv를 생성했습니다')
  }
  // 도면 산출물: 화면에서 놓은 실내기·실외기 좌표를 그대로 싣는다.
  const downloadDrawing = () => {
    const svg = buildDrawingSvg({
      rooms: worldRooms,
      indoorSymbols,
      indoorModelByRoom: indoorByRoom,
      groups,
      outdoorPositions,
      roomColors: roomColorMap(dockFloors), // 화면·도크와 같은 그룹 색을 산출 도면에도
    })
    downloadText('도면.svg', svg, 'image/svg+xml')
    flash('도면.svg를 생성했습니다')
  }
  const captureView = () => {
    const svg = viewerRef.current?.captureSvg()
    if (!svg) { flash('캡처할 도면 화면이 없습니다'); return }
    downloadText('도면_캡처.svg', svg, 'image/svg+xml')
    flash('현재 도면 화면을 캡처했습니다 (SVG)')
  }

  // ── 스텝 가드 ──
  // CTA는 항상 활성이고, 클릭하면 도메인 가드가 낸 사유·해결법을 팝업으로 보여준다.
  const activeGroups = groups.filter((g) => g.items.length)

  // ── 층 전환: 활성 층만 뷰어에 넘길 형태로 파생한다(뷰어는 받은 것만 렌더 — SRP). ──
  const {
    floors, floorNames, activeFloor, setActiveFloor,
    floorRooms, floorIndoorSymbols, floorOutdoorSymbols, floorSelectedIds, floorOutdoorGroups, fitBounds,
  } = useFloorView({ domainRooms, roomGeom, worldRooms, indoorSymbols, outdoorSymbols, activeGroups, selRooms, hpByModel })
  // 층 탭 클릭: 활성 층 전환 + 선택 초기화(다른 층 실이 선택에 남으면 파생값·헤더가 어긋난다).
  const switchFloor = (f: string) => {
    setActiveFloor(f)
    setSelRooms([])
  }

  // 이격거리는 실치수(mm) 규칙이다. 뷰어 좌표는 정규화 단위라 mmPerUnit으로 환산한다.
  // 실도면 타일이 없으면(목업 좌표계) 실치수를 알 수 없어 검사하지 않는다.
  const clearanceViolations = useMemo(() => {
    const mmPerUnit = planDims?.mmPerUnit
    if (!mmPerUnit) return []
    const placed = activeGroups
      .filter((g) => outdoorPositions[g.key])
      .map((g) => ({ key: g.key, label: g.label, x: outdoorPositions[g.key].x * mmPerUnit, y: outdoorPositions[g.key].y * mmPerUnit }))
    return checkClearances(placed).map((v) => v.message)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planDims, outdoorPositions, plan])
  // 스텝 가드 문맥(순수 조립) — 현재 상태를 세어 도메인 가드에 넘길 요약을 만든다(무엇을 세는가만).
  const guardCtx = buildGuardContext({
    domainRooms, placements, pool, groups, activeGroups, outdoorPositions,
    clearanceViolations, selectionRowCount: selectionTable.bom.indoor.length,
  })

  // 스텝 전환 + 가드/확인 모달 + 파괴적 편집(시설군·천정고)을 한 훅으로 묶는다(§5.8).
  // step은 App이 소유(화면 곳곳에서 가드 문맥보다 먼저 읽히는 뷰 상태) — 훅은 전환 로직만 담당한다.
  const {
    generated, confirmed, guard, runGuarded, acceptGuard, dismissGuard,
    onPickStep, confirmEdit, resumeEdit, doGenerate, changeFacility, changeCeilingHeight,
  } = useGenerationSteps({
    step, setStep, guardCtx, edit, setSelRooms, flash, reseedRooms: seedDetectedRooms,
  })

  const placed = Object.keys(placements).length > 0

  // ── 실 자르기(V 도구) ──
  // 실 1곳 → 2곳. 도면에서 잘랐으니 도면 심볼(실내기)도 잘린 위치대로 나뉜다
  // (도면이 진실 — 심볼 1개 = 실내기 1대 = 선정표 대수 1).
  const applySlice = (roomId: string, line: SliceLine) => {
    const parent = domainRooms[roomId]
    const geom = roomGeom[roomId]
    if (!parent || !geom) return

    let children
    try {
      // 뷰어는 도면(월드) 좌표로 선을 그었고, 실 형상은 베이스 좌표에 있다.
      // 축척이 x·y로 다르면 각도가 보존되지 않으므로 방향벡터로 옮긴다(planScale).
      children = sliceRoom(parent, geom, worldLineToBase(line, scale))
    } catch (e) {
      if (e instanceof TooThinSliceError) { flash(e.message); return }
      if (e instanceof SliceMissedRoomError) { flash('절단선이 실을 가르지 않았습니다'); return }
      if (e instanceof SliceProducesManyPiecesError) { flash(e.message); return }
      throw e
    }

    // 부모 자리에 자식을 끼워 넣는다 — 선정표 행 순서·층 섹션이 입력 순서를 따른다.
    const spliceIn = <T,>(src: Record<string, T>, made: [string, T][]): Record<string, T> =>
      Object.fromEntries(Object.entries(src).flatMap(([k, v]) => (k === roomId ? made : [[k, v]])))

    // 실내기: 부모의 심볼을 좌표로 나눠 자식에게 준다(도메인 규칙 splitPlacementAcrossChildren).
    // 자식 좌표는 도면(월드) 좌표로 옮겨 심볼 포함 판정에 쓴다.
    const worldChildren = children.map((c) => ({ id: c.room.id, poly: Polygon.of(scalePoints(c.polygon.points, scale)) }))
    const childPlacements = splitPlacementAcrossChildren(placements[roomId], worldChildren)

    // 자르기는 하나의 편집이다 — 실·형상·배치가 함께 바뀌고 Ctrl+Z 한 번에 함께 돌아온다.
    edit((w) => {
      const placementsNext = { ...w.placements }
      delete placementsNext[roomId] // 부모 배치를 지우지 않으면 도면에 유령 심볼이 남는다
      Object.assign(placementsNext, childPlacements)
      return {
        ...w,
        rooms: spliceIn(w.rooms, children.map((c) => [c.room.id, c.room] as [string, DomainRoom])),
        geom: spliceIn(w.geom, children.map((c) => [c.room.id, c.polygon] as [string, Polygon])),
        placements: placementsNext,
      }
    }, '실 자르기')

    // 사라진 부모를 선택한 채로 두면 파생값(aiSelectionFor)이 undefined를 받아 터진다.
    setSelRooms((prev) => prev.filter((id) => id !== roomId))
    const [a, b] = children
    flash(`${parent.name}을(를) ${a.room.name} · ${b.room.name}(으)로 나눴습니다`)
  }

  // 자르기는 실내기 배치 단계의 도구다(검출 결과를 다듬는다). 모드 진입만 막으면 부족하다 —
  // 단계를 넘긴 뒤에도 모드가 남아 클릭이 실을 잘랐다(적대적 QA). 실행 직전에 단계를 다시 확인한다.
  const doSlice = (roomId: string, line: SliceLine) => {
    if (step !== 'place') { flash('실 자르기는 실내기 배치 단계에서만 가능합니다'); return }
    runGuarded(guardDestructive('ROOM_SLICE', guardCtx), () => applySlice(roomId, line), '자르기')
  }

  // ── 실 병합(M 도구) ──
  // 붙어 있는 두 실을 하나로. 자르기의 역연산이다(형제를 합치면 원래 실이 복원된다).
  // 실내기 심볼은 좌표 그대로 살아남고, 대수는 두 실의 합이 된다(도면이 진실).
  const applyMerge = (aId: string, bId: string) => {
    const a = domainRooms[aId]
    const b = domainRooms[bId]
    const ga = roomGeom[aId]
    const gb = roomGeom[bId]
    if (!a || !b || !ga || !gb) return

    let merged
    try {
      merged = mergeRooms({ room: a, polygon: ga }, { room: b, polygon: gb })
    } catch (e) {
      if (e instanceof NotAdjacentError) { flash('붙어 있지 않은 실은 합칠 수 없습니다'); return }
      if (e instanceof DomainError) { flash(e.message); return }
      throw e
    }

    // 실내기: 두 실의 심볼을 그대로 합친다(도메인 규칙 mergePlacements — 대수 많은 쪽·동수면 면적 큰 쪽
    // 모델 승계, 한 실은 한 모델). 'AI 실내기 배치'로 다시 뽑을 수 있다.
    const mergedPlacement = mergePlacements(placements[aId], placements[bId], merged.room.id, a.areaM2, b.areaM2)

    // 앞선 실(a) 자리에 병합 결과를 끼우고 b는 뺀다 — 선정표 행 순서를 지킨다.
    const spliceMerge = <T,>(src: Record<string, T>, value: T | undefined): Record<string, T> =>
      Object.fromEntries(
        Object.entries(src).flatMap(([k, v]) => {
          if (k === aId) return value === undefined ? [] : [[merged.room.id, value] as [string, T]]
          if (k === bId) return []
          return [[k, v] as [string, T]]
        }),
      )

    edit((w) => ({
      ...w,
      rooms: spliceMerge(w.rooms, merged.room),
      geom: spliceMerge(w.geom, merged.polygon),
      // 배치는 두 실 모두 지우고 합친 것 하나만 남긴다(유령 심볼 방지).
      placements: Object.fromEntries(
        Object.entries(w.placements)
          .filter(([k]) => k !== aId && k !== bId)
          .concat(mergedPlacement ? [[merged.room.id, mergedPlacement]] : []),
      ),
    }), '실 병합')

    setSelRooms((prev) => prev.filter((id) => id !== aId && id !== bId))
    const delta = merged.loadDeltaW / 1000
    flash(
      merged.usageChanged && Math.abs(delta) >= 0.05
        ? `${merged.room.name}으(로) 합쳤습니다 — 용도가 '${merged.room.usage}'이 되어 부하가 ${delta > 0 ? '+' : ''}${delta.toFixed(1)}kW 바뀝니다`
        : `${merged.room.name}으(로) 합쳤습니다 (${merged.room.areaM2.toFixed(1)}㎡)`,
    )
  }

  const doMerge = (aId: string, bId: string) => {
    if (step !== 'place') { flash('실 병합은 실내기 배치 단계에서만 가능합니다'); return }
    runGuarded(guardDestructive('ROOM_MERGE', guardCtx), () => applyMerge(aId, bId), '병합')
  }

  // 두 실이 붙어 있는가 — 뷰어의 프리뷰가 물어본다(판정은 도메인 기하가 한다).
  const roomsAdjacent = (aId: string, bId: string): boolean => {
    const ga = roomGeom[aId]
    const gb = roomGeom[bId]
    return !!ga && !!gb && sharedEdgeLength(ga, gb) > 0
  }

  // 존 모서리 리사이즈 커밋 — 형상 SSOT는 App이다(뷰어는 드래그 중에만 draft로 그린다).
  //
  // 형상만 바꾸면 도면과 표가 다른 실을 말한다(적대적 QA): 면적·단변·장변이 검출 당시 값에 머물러
  // 부하·대수·조합비·선정표가 리사이즈를 전혀 반영하지 못했다. 실의 축척(m/단위)을 지키면서
  // 새 폴리곤에서 면적과 치수를 다시 유도한다 — 자르기와 같은 규칙이다.
  const resizeZone = (roomId: string, points: readonly Pt[]) => {
    const room = domainRooms[roomId]
    const prevPoly = roomGeom[roomId]
    if (!room || !prevPoly) return
    const base = planDims ? points.map((p) => ({ x: p.x / scale.sx, y: p.y / scale.sy })) : points
    let next: Polygon
    try {
      next = Polygon.of(base)
    } catch {
      return // 면적 0 등 성립하지 않는 형상 — 무시한다(뷰어가 GRID 하한으로 이미 막는다)
    }
    const shaped = reshapeRoom(room, prevPoly, next) // 축척 지키며 새 폴리곤에서 면적·치수 재유도(도메인 규칙)
    edit((w) => ({
      ...w,
      geom: { ...w.geom, [roomId]: next },
      rooms: { ...w.rooms, [roomId]: shaped },
    }), '실 크기 조정')
  }

  const doPlace = () => { aiPlace() } // 배치만 → 이동·회전으로 조정. 편집 도구는 순서 강제 없이 자유롭게 오간다.

  // ── 되돌리기 / 다시하기 ──
  // 편집(World)만 되돌린다. 선택·단계 같은 '보기' 상태는 히스토리에 없다.
  // 되돌린 뒤 사라진 실이 선택에 남아 있으면 파생값이 터지므로 선택을 정리한다.
  const doUndo = () => {
    if (!canUndo) return
    const label = undoLabel
    undo()
    flash(label ? `${label}을(를) 되돌렸습니다` : '되돌렸습니다')
  }
  const doRedo = () => {
    if (!canRedo) return
    const label = redoLabel
    redo()
    flash(label ? `${label}을(를) 다시 실행했습니다` : '다시 실행했습니다')
  }
  // 되돌린 결과에 없는 실은 선택에서 뺀다(자르기 undo → 자식 id가 사라진다).
  useEffect(() => {
    setSelRooms((prev) => {
      const kept = prev.filter((id) => domainRooms[id])
      return kept.length === prev.length ? prev : kept
    })
  }, [domainRooms])

  useUndoRedoShortcuts(doUndo, doRedo)

  // 작업 중 새로고침·창 닫기 이탈 방지.
  useEffect(() => {
    if (!placed) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [placed])

  // 우측 패널: 모델 선택이 필요한 단계(실내기 배치·실외기 조합)만 ModelPanel, 나머지는 컨텍스트 패널.
  const showPanel = step === 'place' || step === 'combine'
  // confirmed(산출물 확정 = 편집 잠금)는 useGenerationSteps가 step에서 파생한다.

  return (
    <div className="app">
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
          <nav>
            {GNB_MENUS.map((m) => (
              <a key={m} href="#" className={m === ACTIVE_MENU ? 'on' : undefined}>{m}</a>
            ))}
            {/* 관리자 메뉴는 권한자에게만 보인다. 숨기는 것만으로는 부족해 진입 경로도 막는다(main.tsx). */}
            {canManageEquipment(CURRENT_USER) && <a href="?view=equipment">관리자</a>}
          </nav>
        </div>
        <div className="r">
          <span>{CURRENT_USER.team} / {CURRENT_USER.name} ({CURRENT_USER.email})</span>
          <span>마이페이지</span>
          <span>로그아웃</span>
        </div>
      </div>

      <WorkBar
        current={step}
        onPick={onPickStep}
        actions={
          <>
            {/* 산출물(확정) 상태: 편집 재개로 되열고, 배지로 잠금을 알린다. */}
            {confirmed && <button className="btn sm primary" onClick={resumeEdit} title="편집을 다시 열어 실내기·실외기·조합을 수정합니다">← 편집 재개</button>}
            {confirmed && <span className="confirm-badge" title="산출물이 확정돼 편집이 잠겼습니다. '편집 재개'로 다시 열 수 있습니다.">🔒 확정됨 · 편집 잠금</span>}
            {/* 편집 도구별 액션(자유 전환). 되돌리기(↶↷)는 캔버스 하단 도크에 있다. */}
            {step === 'place' && <ProjectSettings facility={facility} onChange={changeFacility} />}
            {step === 'place' && (
              <CeilingHeightsPanel floors={floorNames} heights={ceilingHeights} onChange={changeCeilingHeight} />
            )}
            {step === 'place' && <button className="btn sm primary" onClick={doPlace}>{placed ? '재배치' : '✦ AI 실내기 배치'}</button>}
            {step === 'combine' && <button className="btn sm" onClick={() => setMapOpen(true)}>실외기 조합 매핑</button>}
            {/* 선정표·일람표는 스텝이 아니라 새 창 — 도면을 가리지 않고 확인·조정(실시간 연동). */}
            {(step === 'combine' || step === 'output') && <button className="btn sm" onClick={openSelectionWindow}>⧉ 선정표 확인</button>}
            {(step === 'combine' || step === 'output') && <button className="btn sm" onClick={openScheduleWindow}>⧉ 일람표 확인</button>}
            {step === 'output' && <button className="btn sm primary" onClick={doGenerate}>{generated ? '재생성' : '장비선정표·도면 생성'}</button>}
            {/* 편집 확정: 세 편집 전제를 일괄 검사 후 산출물로. 전제 미충족이어도 버튼은 살아 있다 — 누르면 가드가 이유를 말한다. */}
            {!confirmed && (
              <button
                className="btn sm primary"
                onClick={confirmEdit}
                title="편집을 확정하고 산출물을 고정합니다. 편집이 잠기며, 편집 재개로 다시 열 수 있습니다."
              >✓ 편집 확정</button>
            )}
            <OverflowMenu items={[{ label: '◉ 현재 화면 캡처', onClick: captureView }]} />
          </>
        }
      />


      {/* 도면은 모든 단계에서 보인다. 산출물 단계도 도면을 보며 내려받는다. */}
      <div className="stage">
        <div className="main-col">
          {/* 층 전환 탭 — 다층일 때만. 단층이면 숨겨 현재 화면과 동일하게 둔다. */}
          {floors.length > 1 && (
            <div className="floor-tabs" role="tablist" aria-label="층 선택">
              {floors.map((f) => (
                <button
                  key={f.floor}
                  type="button"
                  role="tab"
                  aria-selected={f.floor === activeFloor}
                  className={f.floor === activeFloor ? 'floor-tab active' : 'floor-tab'}
                  onClick={() => switchFloor(f.floor)}
                >
                  {f.floor} <span className="floor-tab-n">{f.roomIds.length}</span>
                </button>
              ))}
            </div>
          )}
          <Viewer
            key={planDims ? 'dxf' : 'mock'}
            ref={viewerRef}
            rooms={floorRooms}
            canvas={{
              planW: planDims?.w,
              planH: planDims?.h,
              mmPerUnit: planDims?.mmPerUnit,
              fitBounds,
              tiles,
              tileBase: '/tiles',
            }}
            selectedIds={floorSelectedIds}
            onSelectionChange={setSelRooms}
            onEscape={() => setMapOpen(false)}
            onSelectOutdoorForSelection={
              step === 'combine' ? () => selectOutdoorForSelected(floorSelectedIds) : undefined
            }
            history={{
              canUndo,
              canRedo,
              undoLabel,
              redoLabel,
              onUndo: doUndo,
              onRedo: doRedo,
            }}
            indoor={{
              symbols: floorIndoorSymbols,
              info: indoorInfo,
              canAdd: step === 'place',
              onMove: confirmed ? undefined : moveUnits,
              onRotate: confirmed ? undefined : rotateUnits,
              onDelete: confirmed ? undefined : deleteUnits,
              onAdd: confirmed ? undefined : addUnitToRoom,
              onAddUnavailable: (reason) =>
                flash(
                  reason === 'step'
                    ? "실내기는 '실내기 배치' 단계에서 추가할 수 있습니다."
                    : '추가할 실을 먼저 선택하세요 — 존(실) 모드로 전환했습니다. 배치할 실을 클릭한 뒤 ＋ 실내기를 누르세요.',
                ),
            }}
            outdoor={{
              symbols: floorOutdoorSymbols,
              groups: floorOutdoorGroups,
              canPlace: step === 'outdoor',
              onMove: confirmed ? undefined : moveOutdoors,
              onDelete: confirmed ? undefined : deleteOutdoors,
              onAutoPlace: autoPlaceOutdoors,
            }}
            roomColors={roomColors}
            layers={layers}
            onLayersChange={setLayers}
            onZoneResize={confirmed ? undefined : resizeZone}
            // 실 자르기(V)는 실내기 배치 단계 도구다 — 검출된 실을 다듬는다.
            slice={{
              enabled: step === 'place' && Object.keys(domainRooms).length > 0,
              onSlice: doSlice,
              onUnavailable: () =>
                flash(
                  Object.keys(domainRooms).length === 0
                    ? '자를 실이 없습니다'
                    : '실 자르기는 실내기 배치 단계에서만 가능합니다',
                ),
            }}
            merge={{
              enabled: step === 'place' && Object.keys(domainRooms).length > 1,
              onMerge: doMerge,
              isAdjacent: roomsAdjacent,
              onUnavailable: () =>
                flash(
                  Object.keys(domainRooms).length < 2
                    ? '합칠 실이 두 곳 이상 있어야 합니다'
                    : '실 병합은 실내기 배치 단계에서만 가능합니다',
                ),
            }}
          />
          {/* 조합 매핑은 도면 아래에 붙는다 — 실내기 심볼을 보면서 조합한다. */}
          {mapOpen && step === 'combine' && (
            <MappingDock
              catalog={catalog.list()}
              floors={dockFloors}
              pool={dockUnassigned}
              roomTotal={Object.keys(domainRooms).length}
              selectedRooms={selRooms}
              height={dockH}
              onHeightChange={setDockH}
              onSelectRoom={toggleRoom}
              onSelectGroup={(ids) => setSelRooms(ids)}
              onRemove={removeGroup}
              onEditKcal={overrideRoomCoolKcal}
              onMove={moveRoom}
              onReplace={replaceModel}
              onClose={() => setMapOpen(false)}
            />
          )}
        </div>

        {/* 우측 컨텍스트 패널 — 단계가 내용을 정한다. */}
        {showPanel ? (
          <ModelPanel
            rooms={viewRooms}
            groups={groups}
            selRooms={selRooms}
            tab={tab}
            setTab={setTab}
            models={{ in: indoorCards, out: outdoorCards }}
            open={panelOpen}
            width={panelW}
            onToggle={() => setPanelOpen((v) => !v)}
            onWidthChange={setPanelW}
            onSelectRoom={toggleRoom}
            onFocusRoom={focusRoom}
            selModelIdx={tab === 'in' ? effIn : effOut}
            onSelectModel={selectModel}
            onApply={requestApply}
            indoorByRoom={indoorByRoom}
            aiRooms={aiRooms}
          />
        ) : (
          <PanelShell
            title={step === 'outdoor' ? '실외기 배치' : '산출물'}
            open={panelOpen}
            width={panelW}
            onToggle={() => setPanelOpen((v) => !v)}
            onWidthChange={setPanelW}
          >
            {step === 'outdoor' && (
              <OutdoorPanel
                groups={activeGroups}
                placedKeys={new Set(Object.keys(outdoorPositions))}
                violations={clearanceViolations}
                onAutoPlace={() => viewerRef.current?.placeOutdoors()}
              />
            )}
            {step === 'output' && (
              <OutputPanel
                generated={generated}
                roomCount={Object.keys(placements).length}
                outdoorCount={activeGroups.length}
                hpTotal={selectionTable.bom.hpTotal}
                onDownloadSelection={downloadSelection}
                onDownloadSchedule={downloadSchedule}
                onDownloadDrawing={downloadDrawing}
              />
            )}
          </PanelShell>
        )}
      </div>

      <StatusBar rooms={viewRooms} groups={groups} pool={pool} capByRoom={indoorCapByRoom} />

      {toast && <div className="toast show">{toast}</div>}

      {guard && (
        <GuardModal
          verdict={guard.verdict}
          confirmLabel={guard.confirmLabel}
          confirms={guard.confirms}
          onProceed={acceptGuard}
          onClose={dismissGuard}
        />
      )}

      {confirmMsg && (
        <ConfirmModal
          title="모델 적용 확인"
          message={confirmMsg}
          confirmLabel="확인"
          onConfirm={() => { setConfirmMsg(null); applyModel() }}
          onCancel={() => setConfirmMsg(null)}
        />
      )}

    </div>
  )
}

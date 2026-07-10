import { useState, useMemo, useEffect, useRef } from 'react'
import { ROOMS, CURRENT_USER, GNB_MENUS, ACTIVE_MENU, groupOfRoom, outdoorIdxByModel, DEFAULT_FACILITY } from './data'
import { canManageEquipment } from './domain/auth/Permission'
import type { ModelCard, Room } from './data'
import Viewer, { type LayerFilter, type ViewerHandle } from './components/Viewer'
import type { UnitSym } from './components/viewer/geometry'
import { buildScheduleSheets } from './presentation/generation/scheduleTable'
import { downloadScheduleXlsx } from './presentation/generation/scheduleXlsx'
import { EMPTY_SPEC_REPOSITORY, type EquipmentSpecRepository } from './application/equipment/specPorts'
import { buildDrawingSvg } from './presentation/generation/drawingSvg'
import { downloadText, CSV_BOM } from './presentation/download'
import ModelPanel from './components/ModelPanel'
import MappingDock from './components/generation/MappingDock'
import type { DockRoomInfo } from './components/generation/MappingDock'
import ConfirmModal from './components/ConfirmModal'
import ProjectSettings from './components/steps/ProjectSettings'
import GuardModal from './components/generation/GuardModal'
import WorkBar from './components/generation/WorkBar'
import StatusBar from './components/generation/StatusBar'
import OverflowMenu from './components/generation/OverflowMenu'
import PanelShell from './components/generation/PanelShell'
import DetectPanel from './components/generation/panels/DetectPanel'
import OutdoorPanel from './components/generation/panels/OutdoorPanel'
import OutputPanel from './components/generation/panels/OutputPanel'
import type { FacilityType } from './domain/shared/unitLoadTable'
import { prevStep, isFirstStep } from './presentation/generation/steps'
import { guardAdvance, guardRegress, guardDestructive } from './domain/generation/StepGuard'
import type { StepId, GuardContext, GuardVerdict } from './domain/generation/StepGuard'
import { InMemoryPlanRepository } from './infrastructure/generation/InMemoryPlanRepository'
import { InMemoryOutdoorModelCatalog } from './infrastructure/generation/InMemoryOutdoorModelCatalog'
import type { OutdoorModelSpec } from './application/generation/ports'
import { makeReassignRoom } from './application/generation/ReassignRoom'
import { makeReplaceOutdoorModel } from './application/generation/ReplaceOutdoorModel'
import { makeAddGroup, makeRemoveGroup, makeSplitGroup } from './application/generation/GroupCommands'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta, syncPlanUnits, selectOutdoorPlan, indoorUnitsFor } from './presentation/generation/planAdapter'
import { NotFoundError, NoCompatibleOutdoorError, UnpackableLoadError } from './domain/generation/errors'
import { Room as DomainRoom } from './domain/generation/Room'
import { indoorUnitId, type IndoorUnit } from './domain/generation/IndoorUnit'
import { Placement } from './domain/generation/Placement'
import { applyAiPlacement, placementTotalsW, aiSelectionFor } from './domain/generation/recalc'
import { layoutPositions } from './domain/generation/layoutPositions'
import type { UnitPosition } from './domain/generation/layoutPositions'
import { checkClearances } from './domain/generation/clearanceRules'
import { UnitLoad } from './domain/shared/UnitLoad'
import { InMemoryIndoorModelCatalog } from './infrastructure/generation/InMemoryIndoorModelCatalog'
import { defaultEquipmentMaster } from './infrastructure/equipment/InMemoryEquipmentMaster'
import type { EquipmentMaster } from './domain/equipment/EquipmentMaster'
import { buildSelectionTable } from './domain/generation/SelectionTable'
import { buildSelectionCsv } from './presentation/generation/selectionCsv'
import { useSelectionSync } from './presentation/generation/useSelectionSync'
import { useScheduleSync } from './presentation/generation/useScheduleSync'
import { useTileManifest } from './presentation/generation/useTileManifest'

// 우측 패널 상태 복원 헬퍼(폭은 ModelPanel의 260~560 범위로 클램프).
function loadPanelOpen(): boolean {
  return localStorage.getItem('poc.panel.open') !== '0'
}
function loadPanelW(): number {
  const v = Number(localStorage.getItem('poc.panel.w'))
  return Number.isFinite(v) && v > 0 ? Math.max(260, Math.min(560, v)) : 322
}

export default function App({
  master = defaultEquipmentMaster,
  // 롱테일 스펙(일람표 컬럼). SQLite가 없으면 빈 저장소 → 일람표 셀이 '-'로 남는다.
  specRepository = EMPTY_SPEC_REPOSITORY,
}: { master?: EquipmentMaster; specRepository?: EquipmentSpecRepository } = {}) {
  // 컴포지션 루트: 장비마스터(SSOT)를 주입받고, 실내기·실외기 카탈로그가 이를 참조(PUBLISHED만)한다.
  // 프로덕션은 main.tsx가 SQLite 백엔드 마스터를 주입, 미주입 시 인메모리 기본(테스트·폴백).
  // 배정 상태는 도메인 AssignmentPlan이 소유하고, 리포지토리 포트로 유즈케이스가 로드/저장한다.
  // 모두 세션 1개로 고정(useState lazy).
  const [catalog] = useState(() => new InMemoryOutdoorModelCatalog(master))
  const [repo] = useState(() => new InMemoryPlanRepository(bootstrapPlan()))
  // 실내기 모델 카탈로그(장비마스터 PUBLISHED 참조, 장비번호 코드 기반).
  const [indoorCatalog] = useState(() => new InMemoryIndoorModelCatalog(master))
  const indoorModels = useMemo(() => indoorCatalog.list(), [indoorCatalog])

  const [plan, setPlan] = useState(() => repo.load())
  // 도메인 Room(층·실명·면적·용도·단위부하 Adjustable) — 선정표 그리드에서 편집되는 SSOT.
  // 초기엔 비어 있다(검출 전). '실 검출 실행'이 도면에서 실을 찾아 채운다(파이프라인 의미론).
  const [domainRooms, setDomainRooms] = useState<Record<string, DomainRoom>>({})
  // 시설군은 단위부하의 전제다(같은 실명도 시설군마다 값이 다르다) → 프로젝트 설정으로 검출 전에 정한다.
  const [facility, setFacility] = useState<FacilityType>(DEFAULT_FACILITY)
  // 실별 실내기 배치(모델+대수, AI 기본값+사용자 오버라이드) — 실내기 선정의 SSOT.
  const [placements, setPlacements] = useState<Record<string, Placement>>({})
  const [selRooms, setSelRooms] = useState<string[]>([]) // 초기엔 선택 없음(뱃지·하이라이트 없음)
  const [tab, setTab] = useState<'in' | 'out'>('in')
  // 카드 선택은 기본적으로 대표 실에서 '파생'(실외기=그룹 모델, 실내기=배정/추천)한다.
  // 사용자가 카드를 직접 클릭하면 pick으로 그 파생을 덮어쓰고, 실 선택이 바뀌면 초기화한다.
  const [pick, setPick] = useState<{ in: number | null; out: number | null }>({ in: null, out: null })
  const [prevPrimary, setPrevPrimary] = useState<string | undefined>(undefined)
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

  // 뷰용 실 정보: 좌표·유형은 목업(ROOMS), 실명·부하(kW)는 도메인 Room에서 파생(그리드 편집 반영).
  // 검출된 실(domainRooms)만 순회 — 검출 전에는 빈 객체라 뷰어·리포트가 0/빈 상태가 된다.
  const viewRooms = useMemo<Record<string, Room>>(
    () =>
      Object.fromEntries(
        Object.entries(domainRooms).map(([id, dr]) => {
          const r = ROOMS[id]
          return [id, { ...r, name: dr.name, cool: Math.round(dr.requiredLoadW.cool / 100) / 10 }]
        }),
      ),
    [domainRooms],
  )
  // 우측 패널 접힘/폭은 localStorage에 유지(새로고침 후에도 복원).
  const [panelOpen, setPanelOpen] = useState(() => loadPanelOpen())
  const [panelW, setPanelW] = useState(() => loadPanelW())
  useEffect(() => {
    localStorage.setItem('poc.panel.open', panelOpen ? '1' : '0')
  }, [panelOpen])
  useEffect(() => {
    localStorage.setItem('poc.panel.w', String(panelW))
  }, [panelW])
  // 실외기 심볼 좌표(그룹 key → 좌표). 도면에 놓였는지 여부가 곧 '배치 완료' 여부다.
  const [outdoorPositions, setOutdoorPositions] = useState<Record<string, { x: number; y: number }>>({})
  // 스텝 가드 팝업(차단/확인). null = 닫힘.
  const [guard, setGuard] = useState<{ verdict: Extract<GuardVerdict, { kind: 'BLOCK' } | { kind: 'CONFIRM' }>; proceed: () => void; confirmLabel?: string } | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [dockH, setDockH] = useState(300) // 조합 매핑 도크 높이(드래그로 조절)
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all') // 툴바 레이어 셀렉트 → 뷰어 표시 필터
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null) // 모델 적용 확인 팝업 메시지(null=닫힘)
  const [toast, setToast] = useState('')
  const viewerRef = useRef<ViewerHandle>(null) // 'AI 실내기 배치' 명령용

  // 생성 파이프라인 진행 단계(상태머신) + 목업 단계 플래그.
  const [step, setStep] = useState<StepId>('detect') // 업로드는 목록의 '생성'에서 완료 가정
  const [generated, setGenerated] = useState(false)

  // 실제 도면: Python(ezdxf)로 전처리한 딥줌 타일 피라미드. 좌표계 정합의 토대.
  const { tiles, planDims } = useTileManifest()

  // 목업 실 좌표(720×470)를 정규화 좌표계로 스케일(도면 위 앵커링). 용량·이름 등은 유지.
  const worldRooms = useMemo(() => {
    if (!planDims) return viewRooms
    const sx = planDims.w / 720, sy = planDims.h / 470
    return Object.fromEntries(
      Object.entries(viewRooms).map(([id, r]) => [id, { ...r, x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }] as const),
    )
  }, [planDims, viewRooms])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  // 실 안에 N대를 놓을 도면 좌표. 도메인(Placement)은 "대수만큼 좌표가 있어야 한다"만 알고,
  // 실이 도면 어디에 있는지는 이 어댑터가 안다.
  const layoutFor = (roomId: string, count: number): UnitPosition[] => {
    const r = worldRooms[roomId] ?? ROOMS[roomId]
    if (!r) return []
    return layoutPositions({ x: r.x, y: r.y, w: r.w, h: r.h }, count)
  }

  // 대수가 바뀔 때 좌표 맞추기: 이미 놓인 심볼의 자리는 지키고, 남는 건 자르고 모자라면 새로 깐다.
  const resizePositions = (prev: readonly UnitPosition[], roomId: string, n: number): UnitPosition[] => {
    if (prev.length === n) return [...prev]
    if (prev.length > n) return prev.slice(0, n)
    return [...prev, ...layoutFor(roomId, n).slice(prev.length)]
  }

  // 실내기 배치(placements) → 도메인 실내기 유닛 목록. 대수만큼 유닛이 생기고,
  // 용량은 실 설계부하가 아니라 선정된 모델의 정격이다(조합비·maxConnections의 기준).
  const unitsFrom = (ps: Record<string, Placement>): IndoorUnit[] => {
    const out: IndoorUnit[] = []
    for (const [id, p] of Object.entries(ps)) {
      const room = domainRooms[id]
      const model = indoorCatalog.byCode(p.effectiveSelection.modelCode)
      if (!room || !model) continue
      out.push(...indoorUnitsFor({ id, name: room.name }, p.effectiveSelection.quantity, model))
    }
    return out
  }

  // 유즈케이스(포트 DI). 리포지토리가 고정이라 1회 생성.
  const uc = useMemo(
    () => ({
      reassign: makeReassignRoom({ planRepository: repo }),
      replace: makeReplaceOutdoorModel({ planRepository: repo }),
      add: makeAddGroup({ planRepository: repo }),
      remove: makeRemoveGroup({ planRepository: repo }),
      split: makeSplitGroup({ planRepository: repo }),
    }),
    [repo],
  )
  const sync = () => setPlan(repo.load())

  // 실내기 배치(placements)가 대수·모델의 SSOT다. 바뀌면 플랜을 그에 맞춘다
  // — 그러지 않으면 선정표에서 대수를 고쳐도 조합비·최대 연결 대수가 낡은 값을 본다.
  // 배정은 최대한 보존된다(syncPlanUnits).
  useEffect(() => {
    const next = syncPlanUnits(repo.load(), unitsFrom(placements))
    repo.save(next)
    setPlan(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, domainRooms, repo])

  // 실외기 선정·조합: 배치된 실내기의 정격 총용량으로 실외기를 고른다(도메인 규칙).
  // 실외기 대수·모델은 상수가 아니라 이 계산의 결과다.
  const runOutdoorSelection = (): boolean => {
    const units = unitsFrom(placements)
    if (!units.length) { flash('실내기를 먼저 배치해야 실외기를 선정할 수 있습니다'); return false }
    try {
      const next = selectOutdoorPlan(units, (roomId) => domainRooms[roomId]?.floor ?? '', catalog)
      repo.save(next)
      setPlan(next)
      const odus = next.groups.length
      flash(`✦ 정격 ${(units.reduce((a, u) => a + u.cool.kw, 0)).toFixed(1)}kW에 맞춰 실외기 ${odus}대를 선정했습니다`)
      return true
    } catch (e) {
      if (e instanceof NoCompatibleOutdoorError || e instanceof UnpackableLoadError) { flash(e.message); return false }
      throw e
    }
  }

  // 실외기 단계에 처음 들어오면 선정을 1회 자동 실행한다(그룹이 아직 없을 때만).
  // 이후 사용자가 매핑 팝업에서 조정한 결과는 덮어쓰지 않는다.
  useEffect(() => {
    if ((step !== 'outdoor' && step !== 'combine') || plan.groups.length > 0) return
    if (!Object.keys(placements).length) return
    runOutdoorSelection()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, plan, placements])

  // 컴포넌트가 소비하는 레거시 뷰 형태로 변환(동작 보존).
  const { groups, pool } = toViewModel(plan)

  // 대표 실(헤더/모델 파생 기준). 실내기 목록에서 새로 켠 실이 맨 앞으로 승격된다.
  const primary = selRooms[0]

  // 실 선택이 바뀌면 수동 선택(pick)을 초기화 — 렌더 중 조정(effect·cascading 불필요).
  if (primary !== prevPrimary) {
    setPrevPrimary(primary)
    setPick({ in: null, out: null })
  }

  // 카드 선택 인덱스 파생: 실외기=그룹 실제 모델, 실내기=배정값 우선·없으면 부하 근사 추천.
  // pick(수동 클릭)이 있으면 그 값으로 덮어쓴다.
  const grpOfPrimary = primary ? groupOfRoom(groups, primary) : null
  const derivedOutIdx = grpOfPrimary ? outdoorIdxByModel(grpOfPrimary.model, outdoorCards) : -1
  const appliedCode = primary ? placements[primary]?.effectiveSelection.modelCode : undefined
  const derivedInIdx = appliedCode
    ? Math.max(0, indoorModels.findIndex((m) => m.code === appliedCode))
    : primary
      ? indoorModels.findIndex((m) => m.code === aiSelectionFor(domainRooms[primary], indoorModels).modelCode)
      : -1 // 선택 실 없으면 아무 카드도 선택 안 함
  const effIn = pick.in ?? derivedInIdx
  const effOut = pick.out ?? derivedOutIdx

  // 실(그 실의 모든 실내기 대수)을 대상(to = 그룹 key 또는 'pool')으로 이동. 호환 불가 시 false.
  const moveRoom = (id: string, to: string): boolean => {
    try {
      const res = uc.reassign({ roomId: id, to })
      if (res.ok) sync()
      return res.ok
    } catch (e) {
      if (e instanceof NotFoundError) return false
      throw e
    }
  }

  // 실외기 모델 교체. 계열이 바뀌어 호환 안 되는 실내기는 미배정 풀로 반환.
  const replaceModel = (key: string, spec: OutdoorModelSpec) => {
    const g = plan.groupByKey(key)
    if (!g) return
    const res = uc.replace({ key, outdoorUnit: outdoorUnitFromSpec(spec) })
    sync()
    if (res.ejected.length) {
      flash(`실외기 교체: 계열이 달라 실내기 ${res.ejected.length}개를 미배정으로 옮겼습니다`)
    } else {
      flash(`실외기 ${g.label} 모델을 ${spec.model}(으)로 교체했습니다`)
    }
  }

  // 그룹 분할: 연결된 실의 절반을 같은 실외기 모델의 새 그룹으로 이동.
  const splitGroup = (key: string) => {
    const g = plan.groupByKey(key)
    if (!g || g.roomIds.length < 2) return
    const meta = nextGroupMeta(plan)
    uc.split({ key, meta })
    sync()
    flash(`${g.label}을(를) 분할해 ${meta.label}을(를) 추가했습니다`)
  }

  // 실외기 그룹 추가 (빈 그룹).
  const addGroup = (spec: OutdoorModelSpec) => {
    const meta = nextGroupMeta(plan)
    uc.add({ meta, outdoorUnit: outdoorUnitFromSpec(spec) })
    sync()
    flash(`${meta.label} (${spec.model})을(를) 추가했습니다`)
  }

  // 실외기 그룹 삭제: 연결된 실내기는 미배정 풀로 반환.
  const removeGroup = (key: string) => {
    const g = plan.groupByKey(key)
    if (!g) return
    uc.remove({ key })
    sync()
    flash(`${g.label}을(를) 삭제했습니다`)
  }

  // 우측 패널 실내기 목록에서 실을 클릭하면 선택에 토글. 새로 켠 실은 맨 앞에 두어
  // 대표 실(selRooms[0], 헤더 표시)로 승격 → 헤더(실ID/이름/면적)가 즉시 갱신된다.
  const toggleRoom = (id: string) => {
    setSelRooms((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev]))
  }

  // 실을 대표(맨 앞)로 승격 — 선택 유지, 헤더/추천 모델이 그 실로 이동.
  const focusRoom = (id: string) => {
    setSelRooms((prev) => [id, ...prev.filter((x) => x !== id)])
  }

  // 장비 카드 선택(현재 탭 기준). 실 선택이 바뀌기 전까지 파생값을 덮어쓴다.
  const selectModel = (idx: number) => setPick((p) => ({ ...p, [tab]: idx }))

  // '모델 적용' 클릭 → 유효성 검사 후 확인 팝업을 띄운다(일괄 적용 전 주의).
  // 팝업의 확인 = applyModel 실행, 취소 = 아무 이벤트 없이 닫힘.
  const requestApply = () => {
    if (tab === 'in') {
      const m = indoorCards[effIn]
      if (!m) return
      if (selRooms.length === 0) { flash('적용할 실을 먼저 선택하세요'); return }
      const scope = selRooms.length > 1 ? `${primary} 외 ${selRooms.length - 1}실` : primary
      setConfirmMsg(`실내기 ${m.mn}을(를) 선택한 ${scope}에 일괄 적용합니다. 계속하시겠습니까?`)
      return
    }
    const m = outdoorCards[effOut]
    if (!m) return
    const g = primary ? groupOfRoom(groups, primary) : null
    if (!g) { flash('선택한 실이 실외기 그룹에 배정되어 있지 않습니다'); return }
    setConfirmMsg(`${g.label}의 실외기 모델을 ${m.mn}(으)로 교체합니다. 계속하시겠습니까?`)
  }

  // 선택 모델을 선택 실에 적용(쓰기).
  //  · 실내기: 선택된 모든 실에 모델을 배정(indoorByRoom) → 목록/헤더에 반영
  //  · 실외기: 대표 실이 속한 그룹의 실외기를 실제 교체(도메인 유즈케이스 재사용)
  const applyModel = () => {
    if (tab === 'in') {
      const m = indoorCards[effIn]
      if (!m) return
      if (selRooms.length === 0) { flash('적용할 실을 먼저 선택하세요'); return }
      const model = indoorCatalog.byModel(m.mn)
      if (!model) { flash('카탈로그에 없는 실내기 모델입니다'); return }
      // 수동 적용 = 사용자 오버라이드(AI 재선정에도 보존). 대수는 기존 값 유지, 최초면 1.
      setPlacements((prev) => {
        const next = { ...prev }
        selRooms.forEach((id) => {
          const sel = { modelCode: model.code, quantity: prev[id]?.effectiveSelection.quantity ?? 1 }
          // 모델만 바뀌고 대수는 그대로 → 심볼 좌표도 그대로.
          const positions = prev[id] ? [...prev[id].positions] : layoutFor(id, sel.quantity)
          next[id] = (prev[id] ?? Placement.ai(id, sel, positions)).overrideSelection(sel, positions)
        })
        return next
      })
      const scope = selRooms.length > 1 ? `${primary} 외 ${selRooms.length - 1}실` : primary
      flash(`실내기 ${m.mn}을(를) ${scope}에 적용했습니다`)
      return
    }
    // 실외기 탭: 대표 실이 속한 그룹의 실외기 모델을 교체.
    const m = outdoorCards[effOut]
    if (!m) return
    const g = primary ? groupOfRoom(groups, primary) : null
    if (!g) { flash('선택한 실이 실외기 그룹에 배정되어 있지 않습니다'); return }
    const spec = catalog.list().find((s) => s.model === m.mn)
    if (!spec) { flash('카탈로그에 없는 실외기 모델입니다'); return }
    replaceModel(g.key, spec) // 유즈케이스가 계열 불일치 처리 + 자체 토스트
  }

  // 'AI 실내기 배치' = 모델·대수 선정 + 좌표 생성. 도면 심볼은 그 결과를 그린다(별도 명령 없음).
  const aiPlace = () => {
    // 방마다 필요부하 기반으로 모델+대수 자동 선정. 사용자 수정 셀·좌표는 보존(AI값만 갱신).
    // 플랜 동기화(미배정 풀 편입)는 placements 변경 이펙트가 맡는다. 배정은 이후 combine에서 생긴다.
    setPlacements(applyAiPlacement(Object.values(domainRooms), placements, indoorModels, layoutFor))
    flash('✦ AI가 실 ' + Object.keys(domainRooms).length + '곳에 실내기를 배치·선정했습니다 (수정 셀은 보존)')
  }

  // ── 도면 심볼 = 실내기 대수 (SSOT) ──
  // placements의 좌표를 그대로 심볼로 편다. 심볼 id는 `${roomId}#${n}`(1-based).
  const indoorSymbols = useMemo<UnitSym[]>(
    () =>
      Object.entries(placements).flatMap(([roomId, p]) =>
        p.positions.map((pos, i) => ({ id: indoorUnitId(roomId, i + 1), roomId, x: pos.x, y: pos.y, rot: pos.rot })),
      ),
    [placements],
  )

  // 심볼 id → (실 id, 0-based 인덱스). 파싱 실패는 무시(방어).
  const parseUnitId = (id: string): { roomId: string; index: number } | null => {
    const at = id.lastIndexOf('#')
    if (at < 1) return null
    const n = Number(id.slice(at + 1))
    if (!Number.isInteger(n) || n < 1) return null
    return { roomId: id.slice(0, at), index: n - 1 }
  }

  // 도면에서 심볼을 옮기면 그 실내기의 좌표가 바뀐다(대수·모델은 그대로).
  const moveUnits = (moves: { id: string; x: number; y: number }[]) => {
    setPlacements((prev) => {
      const next = { ...prev }
      for (const m of moves) {
        const ref = parseUnitId(m.id)
        if (!ref || !next[ref.roomId]) continue
        next[ref.roomId] = next[ref.roomId].moveUnit(ref.index, m.x, m.y)
      }
      return next
    })
  }
  const rotateUnits = (rots: { id: string; rot: number }[]) => {
    setPlacements((prev) => {
      const next = { ...prev }
      for (const r of rots) {
        const ref = parseUnitId(r.id)
        if (!ref || !next[ref.roomId]) continue
        next[ref.roomId] = next[ref.roomId].rotateUnit(ref.index, r.rot)
      }
      return next
    })
  }

  // 도면에서 심볼을 지우면 그 실의 대수가 줄고, 선정표·조합비가 즉시 따라온다.
  // 한 실의 여러 대수를 지울 때는 인덱스가 밀리지 않도록 큰 것부터 지운다.
  const deleteUnits = (ids: string[]) => {
    setPlacements((prev) => {
      const next = { ...prev }
      const byRoom = new Map<string, number[]>()
      for (const id of ids) {
        const ref = parseUnitId(id)
        if (!ref || !next[ref.roomId]) continue
        byRoom.set(ref.roomId, [...(byRoom.get(ref.roomId) ?? []), ref.index])
      }
      for (const [roomId, indexes] of byRoom) {
        let p: Placement | null = next[roomId]
        for (const i of [...indexes].sort((a, b) => b - a)) {
          if (!p) break
          p = p.removeUnit(i)
        }
        if (p) next[roomId] = p
        else delete next[roomId] // 마지막 한 대를 지웠다 → 그 실에는 실내기가 없다
      }
      return next
    })
    flash(`실내기 ${ids.length}대를 삭제했습니다 (선정표 대수에 반영)`)
  }

  // 조합 매핑 도크가 쓰는 실 정보. 칩의 kW는 조합비와 같은 기준(설치 정격용량)이다.
  const dockRoomInfo = useMemo<Record<string, DockRoomInfo>>(
    () =>
      Object.fromEntries(
        Object.keys(domainRooms).map((id) => [
          id,
          { name: domainRooms[id].name, type: indoorInfo[id]?.kind ?? '', capKw: indoorCapByRoom[id] ?? 0 },
        ]),
      ),
    [domainRooms, indoorInfo, indoorCapByRoom],
  )

  // ── 실외기 심볼(도면 좌표) ──
  const outdoorSymbols = useMemo<UnitSym[]>(
    () =>
      Object.entries(outdoorPositions).map(([key, p]) => ({ id: key, x: p.x, y: p.y, rot: 0 })),
    [outdoorPositions],
  )
  const moveOutdoors = (moves: { id: string; x: number; y: number }[]) =>
    setOutdoorPositions((prev) => {
      const next = { ...prev }
      for (const m of moves) if (next[m.id]) next[m.id] = { x: m.x, y: m.y }
      return next
    })
  const deleteOutdoors = (keys: string[]) =>
    setOutdoorPositions((prev) => {
      const next = { ...prev }
      for (const k of keys) delete next[k]
      return next
    })
  // 자동 배치: 활성 그룹만 도면 하단에 나열한다.
  const autoPlaceOutdoors = (positions: Record<string, { x: number; y: number }>) => {
    setOutdoorPositions(positions)
    flash(`실외기 ${Object.keys(positions).length}대를 도면에 배치했습니다`)
  }
  // 그룹이 사라지면 그 좌표도 지운다(삭제·재선정으로 key가 바뀔 수 있다).
  useEffect(() => {
    const alive = new Set(plan.groups.map((g) => g.key))
    setOutdoorPositions((prev) => {
      const kept = Object.keys(prev).filter((k) => alive.has(k))
      return kept.length === Object.keys(prev).length ? prev : Object.fromEntries(kept.map((k) => [k, prev[k]]))
    })
  }, [plan])

  // 도면에서 실내기를 더하면 그 실의 대수가 는다. 모델은 그 실의 선정 모델을 따른다.
  const addUnitToRoom = (roomId: string) => {
    setPlacements((prev) => {
      const room = domainRooms[roomId]
      if (!room) return prev
      const existing = prev[roomId]
      if (!existing) {
        // 실내기가 없던 실 → AI 추천 모델 1대로 시작
        const ai = aiSelectionFor(room, indoorModels)
        return { ...prev, [roomId]: Placement.ai(roomId, { ...ai, quantity: 1 }, layoutFor(roomId, 1)) }
      }
      const n = existing.quantity + 1
      const spot = layoutFor(roomId, n)[n - 1] ?? { x: 0, y: 0, rot: 0 }
      return { ...prev, [roomId]: existing.addUnit(spot) }
    })
    flash(`${roomId}에 실내기 1대를 추가했습니다`)
  }

  // ── 선정표 그리드 편집 핸들러: 상류 수정 → 하류(AI 선정·조합비) 재계산 ──
  const updateRoom = (id: string, fn: (r: DomainRoom) => DomainRoom) => {
    const nextRooms = { ...domainRooms, [id]: fn(domainRooms[id]) }
    setDomainRooms(nextRooms)
    // 부하가 바뀌면 AI 선정도 재계산(오버라이드는 보존). 배치 전에는 건드리지 않는다.
    if (Object.keys(placements).length) setPlacements(applyAiPlacement(Object.values(nextRooms), placements, indoorModels, layoutFor))
  }
  const renameRoom = (id: string, name: string) => {
    try { updateRoom(id, (r) => r.rename(name)) } catch { flash('실명은 비워둘 수 없습니다') }
  }
  const overrideUnitLoad = (id: string, coolKcal: number, heatKcal: number) => {
    try { updateRoom(id, (r) => r.overrideUnitLoad(new UnitLoad(coolKcal, heatKcal))) } catch { flash('단위부하는 0보다 큰 숫자여야 합니다') }
  }
  const resetUnitLoad = (id: string) => updateRoom(id, (r) => r.clearUnitLoadOverride())
  // 선정표에서 모델·대수를 고치면 도면 심볼 개수도 함께 바뀐다(대수 SSOT = 심볼).
  const overrideIndoor = (id: string, modelCode: string, quantity: number) => {
    if (!indoorCatalog.byCode(modelCode)) { flash('카탈로그에 없는 모델입니다'); return }
    setPlacements((prev) => {
      const sel = { modelCode, quantity }
      const positions = resizePositions(prev[id]?.positions ?? [], id, quantity)
      return { ...prev, [id]: (prev[id] ?? Placement.ai(id, sel, positions)).overrideSelection(sel, positions) }
    })
  }
  const resetIndoor = (id: string) => {
    setPlacements((prev) => {
      if (!prev[id]) return prev
      // 오버라이드 해제 + 최신 부하 기준 AI 추천으로 갱신. 좌표도 AI 대수에 맞춰 다시 깐다.
      const ai = aiSelectionFor(domainRooms[id], indoorModels)
      const positions = layoutFor(id, ai.quantity)
      return { ...prev, [id]: prev[id].clearOverride(positions).withAiSelection(ai, positions) }
    })
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
    groups: groups.map((g) => ({ key: g.key, label: g.label, model: g.model, items: g.items })),
    indoorModels,
    outdoorSpecs: catalog.list().map((s) => ({ model: s.model, coolKw: s.capacityKw, heatKw: s.heatKw, hp: s.hp, comboRange: s.comboRange })),
  })

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
      indoorModelOptions: indoorModels.map((m) => ({ code: m.code })),
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
  const guardContext = (): GuardContext => ({
    roomCount: Object.keys(domainRooms).length,
    placedRoomCount: Object.keys(placements).length,
    roomsWithoutIndoor: Object.keys(domainRooms).filter((id) => !placements[id]).map((id) => domainRooms[id].name),
    unassignedRoomCount: pool.length,
    activeGroupCount: activeGroups.length,
    emptyGroupCount: groups.length - activeGroups.length,
    overloadedGroups: activeGroups.filter((g) => g.judgement === 'OVERLOADED').map((g) => g.label),
    groupsWithoutPosition: activeGroups.filter((g) => !outdoorPositions[g.key]).map((g) => g.label),
    clearanceViolations,
    // 선정표 행 = 실. BOM만 있고 행이 없으면 산출물이 빈 표가 된다.
    selectionRowCount: selectionTable.bom.indoor.length,
  })

  // 판정을 실행한다. ALLOW면 즉시 진행, BLOCK/CONFIRM이면 팝업을 띄운다.
  const runGuarded = (verdict: GuardVerdict, proceed: () => void, confirmLabel?: string) => {
    if (verdict.kind === 'ALLOW') { proceed(); return }
    setGuard({ verdict, proceed, confirmLabel })
  }

  // 단계 전환 핸들러(파이프라인 진행).
  const placed = Object.keys(placements).length > 0

  // 검출: 도면에서 실을 찾아 도메인 Room으로 채운다. 이미 배치가 있으면 초기화 확인을 받는다.
  const detectRooms = () => {
    const detected = Object.fromEntries(
      Object.entries(ROOMS).map(([id, r]) => [
        id,
        DomainRoom.create({ id, floor: r.floor, name: r.name, areaM2: r.area, usage: r.usage, facility, shortSideM: r.shortSideM, longSideM: r.longSideM }),
      ]),
    )
    setPlacements({}) // 재검출은 하류를 지운다(배치·조합)
    setOutdoorPositions({})
    setDomainRooms(detected)
    setStep('place')
    flash(`AI가 도면에서 실 ${Object.keys(detected).length}곳을 검출했습니다`)
  }
  const doDetect = () => runGuarded(guardDestructive('REDETECT', guardContext()), detectRooms, '재검출')

  const doPlace = () => { aiPlace() } // 배치만(단계 유지) → 이동·회전으로 조정 후 다음 단계로
  // 전진: 가드를 통과해야 넘어간다. 막히면 왜 못 가는지 팝업이 말한다.
  const advance = (to: StepId) => runGuarded(guardAdvance(step, guardContext()), () => setStep(to))
  // 후진: 하류를 무효로 만들 수 있으면 확인을 받는다.
  const regress = (to: StepId) => runGuarded(guardRegress(step, to, guardContext()), () => setStep(to), '돌아가기')

  const doGenerate = () =>
    runGuarded(guardAdvance('output', guardContext()), () => {
      setGenerated(true)
      flash('장비선정표·장비일람표·도면 산출물을 생성했습니다')
    })

  // 시설군 변경: 검출 후에는 부하가 통째로 다시 계산된다 → 확인을 받는다(예전엔 잠갔다).
  const changeFacility = (f: FacilityType) =>
    runGuarded(guardDestructive('FACILITY_CHANGE', guardContext()), () => {
      setFacility(f)
      setPlacements({})
      setOutdoorPositions({})
      setDomainRooms({})
      setStep('detect')
    }, '시설군 변경')

  // 작업 중 새로고침·창 닫기 이탈 방지.
  useEffect(() => {
    if (!placed) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [placed])

  // 우측 패널: 모델 선택이 필요한 단계(실내기 배치·실외기 조합)만 ModelPanel, 나머지는 컨텍스트 패널.
  const showPanel = step === 'place' || step === 'combine'

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
        onGo={regress}
        actions={
          <>
            <button className="btn sm" disabled={isFirstStep(step)} onClick={() => regress(prevStep(step))}>← 이전</button>
            {/* 시설군은 단위부하의 전제다. 검출 후 바꾸면 부하가 통째로 다시 계산된다 → 확인을 받는다. */}
            {step === 'detect' && <ProjectSettings facility={facility} onChange={changeFacility} />}
            {step === 'detect' && <button className="btn sm primary" onClick={doDetect}>실 검출 실행 →</button>}
            {step === 'place' && <button className="btn sm primary" onClick={doPlace}>{placed ? '재배치' : '✦ AI 실내기 배치'}</button>}
            {/* 전제 미충족이어도 버튼은 살아 있다 — 클릭하면 가드가 이유를 말한다. */}
            {step === 'place' && <button className="btn sm primary" onClick={() => advance('combine')}>실외기 선정 →</button>}
            {step === 'combine' && <button className="btn sm" onClick={() => runOutdoorSelection()}>✦ 실외기 재선정</button>}
            {step === 'combine' && <button className="btn sm" onClick={() => setMapOpen(true)}>실외기 조합 매핑</button>}
            {/* 선정표는 스텝이 아니라 새 창 — 도면을 가리지 않고 확인·조정(실시간 연동). */}
            {step === 'combine' && <button className="btn sm" onClick={openSelectionWindow}>⧉ 선정표 확인</button>}
            {step === 'combine' && <button className="btn sm" onClick={openScheduleWindow}>⧉ 일람표 확인</button>}
            {step === 'combine' && <button className="btn sm primary" onClick={() => advance('outdoor')}>실외기 배치 →</button>}
            {step === 'outdoor' && <button className="btn sm primary" onClick={() => advance('output')}>산출물로 →</button>}
            {step === 'output' && <button className="btn sm" onClick={openSelectionWindow}>⧉ 선정표 확인</button>}
            {step === 'output' && <button className="btn sm" onClick={openScheduleWindow}>⧉ 일람표 확인</button>}
            {step === 'output' && <button className="btn sm primary" onClick={doGenerate}>{generated ? '재생성' : '장비선정표·도면 생성'}</button>}
            <OverflowMenu items={[{ label: '◉ 현재 화면 캡처', onClick: captureView }]} />
          </>
        }
      />


      {/* 도면은 모든 단계에서 보인다. 산출물 단계도 도면을 보며 내려받는다. */}
      <div className="stage">
        <div className="main-col">
          <Viewer
            key={planDims ? 'dxf' : 'mock'}
            ref={viewerRef}
            rooms={worldRooms}
            planW={planDims?.w}
            planH={planDims?.h}
            mmPerUnit={planDims?.mmPerUnit}
            selectedIds={selRooms}
            onSelectionChange={setSelRooms}
            onEscape={() => setMapOpen(false)}
            indoorSymbols={indoorSymbols}
            onUnitsMove={moveUnits}
            onUnitsRotate={rotateUnits}
            onUnitsDelete={deleteUnits}
            onUnitAdd={addUnitToRoom}
            outdoorSymbols={outdoorSymbols}
            onOutdoorsMove={moveOutdoors}
            onOutdoorsDelete={deleteOutdoors}
            onOutdoorsAutoPlace={autoPlaceOutdoors}
            indoorInfo={indoorInfo}
            tiles={tiles}
            tileBase="/tiles"
            layerFilter={layerFilter}
            onLayerFilterChange={setLayerFilter}
            canAddUnit={step === 'place' && placed}
            canPlaceOutdoors={step === 'outdoor'}
            outdoorGroups={activeGroups.map((g) => ({ key: g.key, label: g.label, model: g.model }))}
          />
          {/* 조합 매핑은 도면 아래에 붙는다 — 실내기 심볼을 보면서 조합한다. */}
          {mapOpen && step === 'combine' && (
            <MappingDock
              catalog={catalog.list()}
              groups={groups}
              pool={pool}
              roomInfo={dockRoomInfo}
              roomTotal={Object.keys(domainRooms).length}
              height={dockH}
              onHeightChange={setDockH}
              onMove={moveRoom}
              onReplace={replaceModel}
              onSplit={splitGroup}
              onAddGroup={addGroup}
              onRemove={removeGroup}
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
            title={step === 'detect' ? '검출 결과' : step === 'outdoor' ? '실외기 배치' : '산출물'}
            open={panelOpen}
            width={panelW}
            onToggle={() => setPanelOpen((v) => !v)}
            onWidthChange={setPanelW}
          >
            {step === 'detect' && <DetectPanel rooms={viewRooms} facility={facility} />}
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
          onProceed={() => { const p = guard.proceed; setGuard(null); p() }}
          onClose={() => setGuard(null)}
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

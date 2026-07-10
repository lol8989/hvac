import { useState, useMemo, useEffect, useRef } from 'react'
import { ROOMS, CURRENT_USER, GNB_MENUS, ACTIVE_MENU, groupOfRoom, outdoorIdxByModel, DEFAULT_COMBINATION, DEFAULT_FACILITY } from './data'
import { canManageEquipment } from './domain/auth/Permission'
import type { ModelCard, Room } from './data'
import ReportStrip from './components/ReportStrip'
import Viewer, { LAYER_OPTIONS, type LayerFilter, type ViewerHandle, type TileManifest } from './components/Viewer'
import { buildScheduleRows, toCsv } from './presentation/generation/schedule'
import { buildDrawingSvg } from './presentation/generation/drawingSvg'
import { downloadText, CSV_BOM } from './presentation/download'
import ModelPanel from './components/ModelPanel'
import MappingModal from './components/MappingModal'
import ConfirmModal from './components/ConfirmModal'
import Stepper from './components/Stepper'
import StepOverlay from './components/steps/StepOverlay'
import ProjectSettings from './components/steps/ProjectSettings'
import type { FacilityType } from './domain/shared/unitLoadTable'
import { STEPS, stepDef, stepIndex, prevStep, isFirstStep } from './presentation/generation/steps'
import type { StepId } from './presentation/generation/steps'
import { InMemoryPlanRepository } from './infrastructure/generation/InMemoryPlanRepository'
import { InMemoryOutdoorModelCatalog } from './infrastructure/generation/InMemoryOutdoorModelCatalog'
import type { OutdoorModelSpec } from './application/generation/ports'
import { makeReassignIndoorUnit } from './application/generation/ReassignIndoorUnit'
import { makeReplaceOutdoorModel } from './application/generation/ReplaceOutdoorModel'
import { makeAddGroup, makeRemoveGroup, makeSplitGroup } from './application/generation/GroupCommands'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta, ensureRoomsInPool, autoCombine } from './presentation/generation/planAdapter'
import { NotFoundError } from './domain/generation/errors'
import { Room as DomainRoom } from './domain/generation/Room'
import { Placement } from './domain/generation/Placement'
import { applyAiPlacement, placementTotalsW } from './domain/generation/recalc'
import { recommendIndoor } from './domain/generation/recommendIndoor'
import { UnitLoad } from './domain/shared/UnitLoad'
import { InMemoryIndoorModelCatalog } from './infrastructure/generation/InMemoryIndoorModelCatalog'
import { defaultEquipmentMaster } from './infrastructure/equipment/InMemoryEquipmentMaster'
import type { EquipmentMaster } from './domain/equipment/EquipmentMaster'
import { buildSelectionTable } from './domain/generation/SelectionTable'
import { buildSelectionCsv } from './presentation/generation/selectionCsv'
import { SELECTION_CHANNEL } from './presentation/generation/selectionSync'
import type { SelectionMsg, SelectionSnapshotMsg } from './presentation/generation/selectionSync'

// 우측 패널 상태 복원 헬퍼(폭은 ModelPanel의 260~560 범위로 클램프).
function loadPanelOpen(): boolean {
  return localStorage.getItem('poc.panel.open') !== '0'
}
function loadPanelW(): number {
  const v = Number(localStorage.getItem('poc.panel.w'))
  return Number.isFinite(v) && v > 0 ? Math.max(260, Math.min(560, v)) : 322
}

export default function App({ master = defaultEquipmentMaster }: { master?: EquipmentMaster } = {}) {
  // 컴포지션 루트: 장비마스터(SSOT)를 주입받고, 실내기·실외기 카탈로그가 이를 참조(PUBLISHED만)한다.
  // 프로덕션은 main.tsx가 SQLite 백엔드 마스터를 주입, 미주입 시 인메모리 기본(테스트·폴백).
  // 배정 상태는 도메인 AssignmentPlan이 소유하고, 리포지토리 포트로 유즈케이스가 로드/저장한다.
  // 모두 세션 1개로 고정(useState lazy).
  const [catalog] = useState(() => new InMemoryOutdoorModelCatalog(master))
  const [repo] = useState(() => new InMemoryPlanRepository(bootstrapPlan(catalog)))
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
      const code = placements[id]?.effectiveSelection.modelCode ?? recommendIndoor(domainRooms[id].requiredLoadW.cool, indoorModels).modelCode
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
  const [mapOpen, setMapOpen] = useState(false)
  const [layerFilter, setLayerFilter] = useState<LayerFilter>('all') // 툴바 레이어 셀렉트 → 뷰어 표시 필터
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null) // 모델 적용 확인 팝업 메시지(null=닫힘)
  const [toast, setToast] = useState('')
  const viewerRef = useRef<ViewerHandle>(null) // 'AI 실내기 배치' 명령용

  // 생성 파이프라인 진행 단계(상태머신) + 목업 단계 플래그.
  const [step, setStep] = useState<StepId>('detect') // 업로드는 목록의 '생성'에서 완료 가정
  const [generated, setGenerated] = useState(false)

  // 실제 도면: Python(ezdxf)로 전처리한 딥줌 타일 피라미드(public/tiles/manifest.json).
  // 매니페스트의 worldMin/Max(mm)로 뷰어 좌표계를 DXF 월드좌표에 맞춘다(검출·배치·export 정합의 토대).
  const [world, setWorld] = useState<{ w: number; h: number; minX: number; minY: number; maxX: number; maxY: number } | undefined>(undefined)
  const [tiles, setTiles] = useState<TileManifest | undefined>(undefined)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const res = await fetch('/tiles/manifest.json').catch(() => null)
      if (!alive || !res?.ok) return
      const raw: unknown = await res.json()
      const m = raw as TileManifest
      if (alive && m.worldMin && m.worldMax && m.levels) {
        const [ax, ay] = m.worldMin
        const [bx, by] = m.worldMax
        setWorld({ minX: ax, minY: ay, maxX: bx, maxY: by, w: bx - ax, h: by - ay })
        setTiles(m)
      }
    }
    void load()
    return () => { alive = false }
  }, [])

  // 뷰어 정규화 좌표계: 도면 종횡비 유지, 높이 470 기준(심볼·격자 크기 안정). mmPerUnit로 DXF mm 왕복.
  const planDims = useMemo(() => {
    if (!world) return undefined
    const h = 470
    const w = Math.round(h * (world.w / world.h))
    return { w, h, mmPerUnit: world.w / w }
  }, [world])

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

  // 유즈케이스(포트 DI). 리포지토리가 고정이라 1회 생성.
  const uc = useMemo(
    () => ({
      reassign: makeReassignIndoorUnit({ planRepository: repo }),
      replace: makeReplaceOutdoorModel({ planRepository: repo }),
      add: makeAddGroup({ planRepository: repo }),
      remove: makeRemoveGroup({ planRepository: repo }),
      split: makeSplitGroup({ planRepository: repo }),
    }),
    [repo],
  )
  const sync = () => setPlan(repo.load())

  // 실외기 배치(outdoor) 진입 시 '자동 조합' 기본 매핑을 1회 적용 — 배치할 실외기 그룹이 이때 정해진다.
  // (combine 직행 등 예외 경로도 커버) 이미 배정이 있으면 덮어쓰지 않는다. ref로 세션당 1회 보장.
  const autoCombinedRef = useRef(false)
  useEffect(() => {
    if ((step !== 'outdoor' && step !== 'combine') || autoCombinedRef.current) return
    const placedIds = Object.keys(placements)
    if (!placedIds.length) return // 실내기 배치 전이면 조합할 대상이 없다
    autoCombinedRef.current = true
    // 배치된 실을 빠짐없이 플랜에 편입(AI/수동 무관) 후, 아직 배정이 없으면 기본 조합을 적용.
    let next = ensureRoomsInPool(plan, placedIds)
    if (!next.groups.some((g) => g.indoorUnits.length)) next = autoCombine(next, DEFAULT_COMBINATION)
    repo.save(next)
    setPlan(next)
  }, [step, plan, placements, repo])

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
      ? indoorModels.findIndex((m) => m.code === recommendIndoor(domainRooms[primary].requiredLoadW.cool, indoorModels).modelCode)
      : -1 // 선택 실 없으면 아무 카드도 선택 안 함
  const effIn = pick.in ?? derivedInIdx
  const effOut = pick.out ?? derivedOutIdx

  // 실내기(id)를 대상(to = 그룹 key 또는 'pool')으로 이동. 호환 불가 시 false.
  const moveRoom = (id: string, to: string): boolean => {
    try {
      const res = uc.reassign({ indoorId: id, to })
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

  // 그룹 분할: 실내기 절반을 같은 실외기 모델의 새 그룹으로 이동.
  const splitGroup = (key: string) => {
    const g = plan.groupByKey(key)
    if (!g || g.indoorUnits.length < 2) return
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
          next[id] = (prev[id] ?? Placement.ai(id, sel)).overrideSelection(sel)
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

  const aiPlace = () => {
    viewerRef.current?.placeUnits() // 실제 배치 실행(빈 도면 → 방별 실내기 심볼)
    // 방마다 필요부하 기반으로 모델+대수 자동 선정. 사용자 수정 셀은 보존(AI값만 갱신).
    setPlacements((prev) => applyAiPlacement(Object.values(domainRooms), prev, indoorModels))
    // 실내기 설치 결과 → 실외기 배정 대상(미배정 풀)으로 편입. 배정은 이후 combine에서 생긴다.
    const withPool = ensureRoomsInPool(plan, Object.keys(domainRooms))
    repo.save(withPool)
    setPlan(withPool)
    flash('✦ AI가 실 ' + Object.keys(domainRooms).length + '곳에 실내기를 배치·선정했습니다 (수정 셀은 보존)')
  }

  // ── 선정표 그리드 편집 핸들러: 상류 수정 → 하류(AI 선정·조합비) 재계산 ──
  const updateRoom = (id: string, fn: (r: DomainRoom) => DomainRoom) => {
    const nextRooms = { ...domainRooms, [id]: fn(domainRooms[id]) }
    setDomainRooms(nextRooms)
    // 부하가 바뀌면 AI 선정도 재계산(오버라이드는 보존). 배치 전에는 건드리지 않는다.
    if (Object.keys(placements).length) setPlacements(applyAiPlacement(Object.values(nextRooms), placements, indoorModels))
  }
  const renameRoom = (id: string, name: string) => {
    try { updateRoom(id, (r) => r.rename(name)) } catch { flash('실명은 비워둘 수 없습니다') }
  }
  const overrideUnitLoad = (id: string, coolKcal: number, heatKcal: number) => {
    try { updateRoom(id, (r) => r.overrideUnitLoad(new UnitLoad(coolKcal, heatKcal))) } catch { flash('단위부하는 0보다 큰 숫자여야 합니다') }
  }
  const resetUnitLoad = (id: string) => updateRoom(id, (r) => r.clearUnitLoadOverride())
  const overrideIndoor = (id: string, modelCode: string, quantity: number) => {
    if (!indoorCatalog.byCode(modelCode)) { flash('카탈로그에 없는 모델입니다'); return }
    setPlacements((prev) => {
      const sel = { modelCode, quantity }
      return { ...prev, [id]: (prev[id] ?? Placement.ai(id, sel)).overrideSelection(sel) }
    })
  }
  const resetIndoor = (id: string) => {
    setPlacements((prev) => {
      if (!prev[id]) return prev
      // 오버라이드 해제 + 최신 부하 기준 AI 추천으로 갱신.
      const ai = recommendIndoor(domainRooms[id].requiredLoadW.cool, indoorModels)
      return { ...prev, [id]: prev[id].clearOverride().withAiSelection(ai) }
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

  // ── 장비선정표 '새 창' 동기화 (도면을 가리지 않도록 별도 창에서 확인·조정) ──
  // 최신 스냅샷·핸들러를 ref로 유지해 채널 콜백의 stale closure를 방지한다.
  const selectionSnapshot: SelectionSnapshotMsg = {
    type: 'table',
    table: selectionTable,
    groupOptions: groups.map((g) => ({ key: g.key, label: g.label })),
    indoorModelOptions: indoorModels.map((m) => ({ code: m.code })),
  }
  const snapshotRef = useRef(selectionSnapshot)
  snapshotRef.current = selectionSnapshot
  const editRef = useRef({ renameRoom, overrideUnitLoad, resetUnitLoad, overrideIndoor, resetIndoor, moveRoomFromGrid })
  editRef.current = { renameRoom, overrideUnitLoad, resetUnitLoad, overrideIndoor, resetIndoor, moveRoomFromGrid }
  const bcRef = useRef<BroadcastChannel | null>(null)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel(SELECTION_CHANNEL)
    bcRef.current = bc
    bc.onmessage = (e: MessageEvent<SelectionMsg>) => {
      const m = e.data
      if (m?.type === 'hello') { bc.postMessage(snapshotRef.current); return } // 새 창 접속 → 현재 스냅샷 응답
      if (m?.type !== 'edit') return
      const h = editRef.current
      if (m.op === 'rename') h.renameRoom(m.roomId, m.name)
      else if (m.op === 'unitLoad') h.overrideUnitLoad(m.roomId, m.coolKcal, m.heatKcal)
      else if (m.op === 'resetUnitLoad') h.resetUnitLoad(m.roomId)
      else if (m.op === 'indoor') h.overrideIndoor(m.roomId, m.modelCode, m.quantity)
      else if (m.op === 'resetIndoor') h.resetIndoor(m.roomId)
      else if (m.op === 'move') h.moveRoomFromGrid(m.roomId, m.to)
    }
    return () => { bc.close(); bcRef.current = null }
  }, [])
  // 상태가 바뀔 때마다 새 창에 스냅샷 재방송(편집 결과 즉시 반영).
  useEffect(() => { bcRef.current?.postMessage(snapshotRef.current) }, [domainRooms, placements, plan])

  // 선정표 새 창 열기 — 이름 있는 창이라 반복 클릭 시 같은 창을 재사용한다.
  const openSelectionWindow = () => {
    window.open(`${window.location.pathname}?view=selection`, 'poc-selection-window', 'width=1480,height=860')
  }

  // 산출물 다운로드(목업 데이터 기반 생성): 장비일람표 CSV(Excel 호환) · 독립 SVG 도면 · 현재 화면 캡처.
  const downloadSchedule = () => {
    const rows = buildScheduleRows(groups, indoorByRoom, viewRooms, indoorCards)
    if (!rows.length) { flash('다운로드할 결과가 없습니다 — 실내기 배치·조합을 먼저 진행하세요'); return }
    downloadText('장비일람표.csv', CSV_BOM + toCsv(rows), 'text/csv;charset=utf-8')
    flash(`장비일람표.csv를 생성했습니다 (${rows.length}행)`)
  }
  // 장비선정표(행=실, 층합계·BOM 포함) — 표준 260415 엑셀 양식의 CSV 직렬화.
  const downloadSelection = () => {
    if (!Object.keys(placements).length) { flash('다운로드할 선정 결과가 없습니다 — 실내기 배치를 먼저 진행하세요'); return }
    downloadText('장비선정표.csv', CSV_BOM + buildSelectionCsv(selectionTable), 'text/csv;charset=utf-8')
    flash('장비선정표.csv를 생성했습니다')
  }
  const downloadDrawing = () => {
    downloadText('도면.svg', buildDrawingSvg(viewRooms, indoorByRoom, groups), 'image/svg+xml')
    flash('도면.svg를 생성했습니다')
  }
  const captureView = () => {
    const svg = viewerRef.current?.captureSvg()
    if (!svg) { flash('캡처할 도면 화면이 없습니다'); return }
    downloadText('도면_캡처.svg', svg, 'image/svg+xml')
    flash('현재 도면 화면을 캡처했습니다 (SVG)')
  }

  // 단계 전환 핸들러(파이프라인 진행). 목업 단계는 플래그만 세우고 다음으로.
  const placed = Object.keys(placements).length > 0
  // 검출: 도면에서 실을 찾아 도메인 Room으로 채운다(초기 빈 상태 → 6실). 이후 부하·선정표가 채워진다.
  const doDetect = () => {
    const detected = Object.fromEntries(
      Object.entries(ROOMS).map(([id, r]) => [id, DomainRoom.create({ id, floor: r.floor, name: r.name, areaM2: r.area, usage: r.usage, facility })]),
    )
    setDomainRooms(detected)
    setStep('place')
    flash(`AI가 도면에서 실 ${Object.keys(detected).length}곳을 검출했습니다`)
  }
  const doPlace = () => { aiPlace() } // 배치만(단계 유지) → 이동·회전으로 조정 후 '실외기 배치 →'로 진행
  const doOutdoorDone = () => setStep('combine')
  const doCombineNext = () => {
    if (pool.length > 0) { flash(`미배정 실내기 ${pool.length}개가 남아 있습니다 — 조합 매핑에서 배정하세요`); return }
    setStep('output')
  }
  const doGenerate = () => { setGenerated(true); flash('장비선정표(Excel)·도면 산출물을 생성했습니다') }

  // 단계별 화면 구성.
  const showViewer = step === 'detect' || step === 'place' || step === 'outdoor' || step === 'combine'
  const showPanel = step === 'place' || step === 'outdoor' || step === 'combine'

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

      <div className="sub">
        <a href="#" className="back">← 목록으로</a>
        <div className="title">생성 작업 — {stepDef(step).label}</div>
        <span className="b">{stepIndex(step) + 1} / {STEPS.length}</span>
      </div>

      <Stepper current={step} onGo={setStep} />

      <ReportStrip
        rooms={viewRooms}
        groups={groups}
        pool={pool}
        capByRoom={indoorCapByRoom}
        actions={
          <>
            <button className="btn sm" disabled={isFirstStep(step)} onClick={() => setStep(prevStep(step))}>← 이전</button>
            {/* 시설군은 단위부하의 전제다 → 검출 전에 정하고, 검출 후에는 잠근다. */}
            {step === 'detect' && <ProjectSettings facility={facility} locked={Object.keys(domainRooms).length > 0} onChange={setFacility} />}
            {step === 'detect' && <button className="btn sm primary" onClick={doDetect}>실 검출 실행 →</button>}
            {step === 'place' && <button className="btn sm primary" onClick={doPlace}>{placed ? '재배치' : '✦ AI 실내기 배치'}</button>}
            {step === 'place' && placed && <button className="btn sm primary" onClick={() => setStep('outdoor')}>실외기 배치 →</button>}
            {step === 'outdoor' && <button className="btn sm primary" onClick={doOutdoorDone}>실외기 조합 →</button>}
            {step === 'combine' && <button className="btn sm" onClick={() => setMapOpen(true)}>실외기 조합 매핑</button>}
            {/* 선정표는 스텝이 아니라 새 창 — 도면을 가리지 않고 확인·조정(실시간 연동). */}
            {step === 'combine' && <button className="btn sm" onClick={openSelectionWindow}>⧉ 선정표 확인</button>}
            {/* 미배정이 남아도 클릭은 받되, doCombineNext가 이유를 토스트로 안내(무반응 방지). */}
            {step === 'combine' && <button className="btn sm primary" onClick={doCombineNext}>산출물로 →</button>}
            {step === 'output' && <button className="btn sm" onClick={openSelectionWindow}>⧉ 선정표 확인</button>}
            {step === 'output' && <button className="btn sm primary" onClick={doGenerate}>{generated ? '재생성' : '장비선정표·도면 생성'}</button>}
          </>
        }
      />

      {step === 'output' && (
        <StepOverlay
          icon={generated ? '✓' : '⤓'}
          title={generated ? '산출물 생성 완료' : '산출물 생성'}
          desc={generated ? '장비선정표·장비일람표(Excel)와 도면을 다운로드할 수 있습니다.' : '검토한 선정표로 산출물을 생성합니다.'}
          meta={`총 설치 실 ${Object.keys(placements).length}곳 · 실외기 ${groups.filter((g) => g.items.length).length}대 · ${selectionTable.bom.hpTotal}HP`}
        >
          {generated && (
            <>
              <button className="btn" onClick={downloadSelection}>⭳ 장비선정표.csv</button>
              <button className="btn" onClick={downloadSchedule}>⭳ 장비일람표.csv</button>
              <button className="btn" onClick={downloadDrawing}>⭳ 도면.svg</button>
            </>
          )}
        </StepOverlay>
      )}


      {showViewer && (
        <div className="stage">
          <div className="main-col">
            <div className="toolbar">
              <select className="field" value={layerFilter} onChange={(e) => setLayerFilter(e.target.value as LayerFilter)}>
                {LAYER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="tb-actions">
                <button className="btn sm" onClick={downloadSchedule}>⭳ 결과 다운로드</button>
                <button className="btn sm" onClick={captureView}>◉ 캡처</button>
              </div>
            </div>
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
              indoorInfo={indoorInfo}
              tiles={tiles}
              tileBase="/tiles"
              layerFilter={layerFilter}
              canAddUnit={step === 'place' && placed}
              canPlaceOutdoors={step === 'outdoor'}
              outdoorGroups={groups.filter((g) => g.items.length).map((g) => ({ key: g.key, label: g.label, model: g.model }))}
            />
          </div>
          {showPanel && (
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
          )}
        </div>
      )}

      {toast && <div className="toast show">{toast}</div>}

      {confirmMsg && (
        <ConfirmModal
          title="모델 적용 확인"
          message={confirmMsg}
          confirmLabel="확인"
          onConfirm={() => { setConfirmMsg(null); applyModel() }}
          onCancel={() => setConfirmMsg(null)}
        />
      )}

      {mapOpen && (
        <MappingModal
          catalog={catalog.list()}
          groups={groups}
          pool={pool}
          capByRoom={indoorCapByRoom}
          onMove={moveRoom}
          onReplace={replaceModel}
          onSplit={splitGroup}
          onAddGroup={addGroup}
          onRemove={removeGroup}
          onClose={() => setMapOpen(false)}
          onApply={() => setMapOpen(false)}
        />
      )}
    </div>
  )
}

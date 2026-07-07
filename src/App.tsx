import { useState, useMemo, useEffect, useRef } from 'react'
import { ROOMS, MODELS, CURRENT_USER, GNB_MENUS, ACTIVE_MENU, groupOfRoom, recommendedIndoorIdx, outdoorIdxByModel, resolveIndoorCard, indoorCoolByModel } from './data'
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
import { STEPS, stepDef, stepIndex, prevStep, isFirstStep } from './presentation/generation/steps'
import type { StepId } from './presentation/generation/steps'
import { InMemoryPlanRepository } from './infrastructure/generation/InMemoryPlanRepository'
import { InMemoryOutdoorModelCatalog } from './infrastructure/generation/InMemoryOutdoorModelCatalog'
import type { OutdoorModelSpec } from './application/generation/ports'
import { makeReassignIndoorUnit } from './application/generation/ReassignIndoorUnit'
import { makeReplaceOutdoorModel } from './application/generation/ReplaceOutdoorModel'
import { makeAddGroup, makeRemoveGroup, makeSplitGroup } from './application/generation/GroupCommands'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta } from './presentation/generation/planAdapter'
import { NotFoundError } from './domain/generation/errors'

// 우측 패널 상태 복원 헬퍼(폭은 ModelPanel의 260~560 범위로 클램프).
function loadPanelOpen(): boolean {
  return localStorage.getItem('poc.panel.open') !== '0'
}
function loadPanelW(): number {
  const v = Number(localStorage.getItem('poc.panel.w'))
  return Number.isFinite(v) && v > 0 ? Math.max(260, Math.min(560, v)) : 322
}

export default function App() {
  // 장비마스터 실외기 스펙 카탈로그(읽기 포트). 배정 상태는 도메인 AssignmentPlan이 소유하고,
  // 인메모리 리포지토리 포트를 통해 유즈케이스가 로드/저장한다. 모두 세션 1개로 고정(useState lazy).
  const [catalog] = useState(() => new InMemoryOutdoorModelCatalog())
  const [repo] = useState(() => new InMemoryPlanRepository(bootstrapPlan(catalog)))

  const [plan, setPlan] = useState(() => repo.load())
  const [selRooms, setSelRooms] = useState<string[]>([]) // 초기엔 선택 없음(뱃지·하이라이트 없음)
  const [tab, setTab] = useState<'in' | 'out'>('in')
  // 카드 선택은 기본적으로 대표 실에서 '파생'(실외기=그룹 모델, 실내기=배정/추천)한다.
  // 사용자가 카드를 직접 클릭하면 pick으로 그 파생을 덮어쓰고, 실 선택이 바뀌면 초기화한다.
  const [pick, setPick] = useState<{ in: number | null; out: number | null }>({ in: null, out: null })
  const [prevPrimary, setPrevPrimary] = useState<string | undefined>(undefined)
  // 실별 적용된 실내기 모델(모델명). 'AI 실내기 배치'(자동) 또는 '모델 적용'(수동)으로 채워진다.
  const [indoorByRoom, setIndoorByRoom] = useState<Record<string, string>>({})
  // AI가 자동 선정한 실(수동 적용 시 해제) — 목록에서 'AI' 표기 구분용.
  const [aiRooms, setAiRooms] = useState<Set<string>>(new Set())

  // 실별 실내기 정격용량(kW) — 조합 리포트/조합비의 'B: 선택 장비 기준' 산정용. 미적용은 0(미설치).
  const indoorCapByRoom = useMemo(() => {
    const map: Record<string, number> = {}
    for (const id of Object.keys(ROOMS)) map[id] = indoorCoolByModel(indoorByRoom[id])
    return map
  }, [indoorByRoom])

  // 실별 실내기 표시정보(모델명·유형) — 도면 심볼 오버레이용. 배정값 우선, 없으면 부하 근사 추천.
  const indoorInfo = useMemo(() => {
    const map: Record<string, { model: string; kind: string }> = {}
    for (const id of Object.keys(ROOMS)) {
      const card = resolveIndoorCard(ROOMS[id].cool, indoorByRoom[id])
      map[id] = { model: card.mn, kind: card.kind ?? '' }
    }
    return map
  }, [indoorByRoom])
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
    if (!planDims) return ROOMS
    const sx = planDims.w / 720, sy = planDims.h / 470
    return Object.fromEntries(
      Object.entries(ROOMS).map(([id, r]) => [id, { ...r, x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy }] as const),
    )
  }, [planDims])

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
  const derivedOutIdx = grpOfPrimary ? outdoorIdxByModel(grpOfPrimary.model) : -1
  const appliedIn = primary ? indoorByRoom[primary] : undefined
  const derivedInIdx = appliedIn
    ? Math.max(0, MODELS.in.findIndex((m) => m.mn === appliedIn))
    : primary
      ? recommendedIndoorIdx(ROOMS[primary].cool)
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
      const m = MODELS.in[effIn]
      if (!m) return
      if (selRooms.length === 0) { flash('적용할 실을 먼저 선택하세요'); return }
      const scope = selRooms.length > 1 ? `${primary} 외 ${selRooms.length - 1}실` : primary
      setConfirmMsg(`실내기 ${m.mn}을(를) 선택한 ${scope}에 일괄 적용합니다. 계속하시겠습니까?`)
      return
    }
    const m = MODELS.out[effOut]
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
      const m = MODELS.in[effIn]
      if (!m) return
      if (selRooms.length === 0) { flash('적용할 실을 먼저 선택하세요'); return }
      setIndoorByRoom((prev) => {
        const next = { ...prev }
        selRooms.forEach((id) => { next[id] = m.mn })
        return next
      })
      setAiRooms((prev) => { const n = new Set(prev); selRooms.forEach((id) => n.delete(id)); return n }) // 수동 적용 → AI 표기 해제
      const scope = selRooms.length > 1 ? `${primary} 외 ${selRooms.length - 1}실` : primary
      flash(`실내기 ${m.mn}을(를) ${scope}에 적용했습니다`)
      return
    }
    // 실외기 탭: 대표 실이 속한 그룹의 실외기 모델을 교체.
    const m = MODELS.out[effOut]
    if (!m) return
    const g = primary ? groupOfRoom(groups, primary) : null
    if (!g) { flash('선택한 실이 실외기 그룹에 배정되어 있지 않습니다'); return }
    const spec = catalog.list().find((s) => s.model === m.mn)
    if (!spec) { flash('카탈로그에 없는 실외기 모델입니다'); return }
    replaceModel(g.key, spec) // 유즈케이스가 계열 불일치 처리 + 자체 토스트
  }

  const aiPlace = () => {
    viewerRef.current?.placeUnits() // 실제 배치 실행(빈 도면 → 방별 실내기 심볼)
    // 방마다 냉방부하 근사 알고리듬으로 실내기 모델 자동 선정(AI 선택).
    const picks: Record<string, string> = {}
    for (const id of Object.keys(ROOMS)) picks[id] = MODELS.in[recommendedIndoorIdx(ROOMS[id].cool)].mn
    setIndoorByRoom(picks)
    setAiRooms(new Set(Object.keys(ROOMS)))
    flash('✦ AI가 실 ' + Object.keys(ROOMS).length + '곳에 실내기를 자동 배치·선정했습니다 (부하 근사 모델)')
  }

  // 산출물 다운로드(목업 데이터 기반 생성): 장비일람표 CSV(Excel 호환) · 독립 SVG 도면 · 현재 화면 캡처.
  const downloadSchedule = () => {
    const rows = buildScheduleRows(groups, indoorByRoom, ROOMS, MODELS.in)
    if (!rows.length) { flash('다운로드할 결과가 없습니다 — 실내기 배치·조합을 먼저 진행하세요'); return }
    downloadText('장비일람표.csv', CSV_BOM + toCsv(rows), 'text/csv;charset=utf-8')
    flash(`장비일람표.csv를 생성했습니다 (${rows.length}행)`)
  }
  const downloadDrawing = () => {
    downloadText('도면.svg', buildDrawingSvg(ROOMS, indoorByRoom, groups), 'image/svg+xml')
    flash('도면.svg를 생성했습니다')
  }
  const captureView = () => {
    const svg = viewerRef.current?.captureSvg()
    if (!svg) { flash('캡처할 도면 화면이 없습니다'); return }
    downloadText('도면_캡처.svg', svg, 'image/svg+xml')
    flash('현재 도면 화면을 캡처했습니다 (SVG)')
  }

  // 단계 전환 핸들러(파이프라인 진행). 목업 단계는 플래그만 세우고 다음으로.
  const placed = Object.keys(indoorByRoom).length > 0
  const doDetect = () => { setStep('place'); flash(`AI가 도면에서 실 ${Object.keys(ROOMS).length}곳을 검출했습니다`) }
  const doPlace = () => { aiPlace() } // 배치만(단계 유지) → 결과 확인 후 '미세조정 →'으로 진행
  const doAdjustDone = () => setStep('combine')
  const doCombineNext = () => {
    if (pool.length > 0) { flash(`미배정 실내기 ${pool.length}개가 남아 있습니다 — 조합 매핑에서 배정하세요`); return }
    setStep('output')
  }
  const doGenerate = () => { setGenerated(true); flash('장비일람표(Excel)·도면 산출물을 생성했습니다') }

  // 단계별 화면 구성.
  const showViewer = step === 'detect' || step === 'place' || step === 'adjust' || step === 'combine'
  const showPanel = step === 'place' || step === 'adjust' || step === 'combine'

  return (
    <div className="app">
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
          <nav>
            {GNB_MENUS.map((m) => (
              <a key={m} href="#" className={m === ACTIVE_MENU ? 'on' : undefined}>{m}</a>
            ))}
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
        rooms={ROOMS}
        groups={groups}
        pool={pool}
        capByRoom={indoorCapByRoom}
        actions={
          <>
            <button className="btn sm" disabled={isFirstStep(step)} onClick={() => setStep(prevStep(step))}>← 이전</button>
            {step === 'detect' && <button className="btn sm primary" onClick={doDetect}>실 검출 실행 →</button>}
            {step === 'place' && <button className="btn sm primary" onClick={doPlace}>{placed ? '재배치' : '✦ AI 실내기 배치'}</button>}
            {step === 'place' && placed && <button className="btn sm primary" onClick={() => setStep('adjust')}>미세조정 →</button>}
            {step === 'adjust' && <button className="btn sm primary" onClick={doAdjustDone}>미세조정 완료 →</button>}
            {step === 'combine' && <button className="btn sm" onClick={() => setMapOpen(true)}>실외기 조합 매핑</button>}
            {step === 'combine' && <button className="btn sm primary" onClick={doCombineNext} disabled={pool.length > 0}>산출물로 →</button>}
            {step === 'output' && <button className="btn sm primary" onClick={doGenerate}>{generated ? '재생성' : '장비일람표·도면 생성'}</button>}
          </>
        }
      />

      {step === 'output' && (
        <StepOverlay
          icon={generated ? '✓' : '⤓'}
          title={generated ? '산출물 생성 완료' : '산출물 생성'}
          desc={generated ? '장비일람표(Excel)와 도면을 다운로드할 수 있습니다.' : '선정 데이터로 장비일람표·도면을 생성합니다.'}
          meta={`총 설치 실 ${Object.keys(indoorByRoom).length}곳 · 실외기 ${groups.filter((g) => g.items.length).length}대`}
        >
          {generated && (
            <>
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
              canPlaceOutdoors={step === 'combine'}
              outdoorGroups={groups.filter((g) => g.items.length).map((g) => ({ key: g.key, label: g.label, model: g.model }))}
            />
          </div>
          {showPanel && (
            <ModelPanel
              rooms={ROOMS}
              groups={groups}
              selRooms={selRooms}
              tab={tab}
              setTab={setTab}
              models={MODELS}
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

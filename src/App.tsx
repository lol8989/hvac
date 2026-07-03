import { useState, useMemo } from 'react'
import { ROOMS, MODELS } from './data'
import ReportStrip from './components/ReportStrip'
import Viewer from './components/Viewer'
import ModelPanel from './components/ModelPanel'
import MappingModal from './components/MappingModal'
import { InMemoryPlanRepository } from './infrastructure/generation/InMemoryPlanRepository'
import { InMemoryOutdoorModelCatalog } from './infrastructure/generation/InMemoryOutdoorModelCatalog'
import type { OutdoorModelSpec } from './application/generation/ports'
import { makeReassignIndoorUnit } from './application/generation/ReassignIndoorUnit'
import { makeReplaceOutdoorModel } from './application/generation/ReplaceOutdoorModel'
import { makeAddGroup, makeRemoveGroup, makeSplitGroup } from './application/generation/GroupCommands'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta } from './presentation/generation/planAdapter'
import { NotFoundError } from './domain/generation/errors'

export default function App() {
  // 장비마스터 실외기 스펙 카탈로그(읽기 포트). 배정 상태는 도메인 AssignmentPlan이 소유하고,
  // 인메모리 리포지토리 포트를 통해 유즈케이스가 로드/저장한다. 모두 세션 1개로 고정(useState lazy).
  const [catalog] = useState(() => new InMemoryOutdoorModelCatalog())
  const [repo] = useState(() => new InMemoryPlanRepository(bootstrapPlan(catalog)))

  const [plan, setPlan] = useState(() => repo.load())
  const [selRooms, setSelRooms] = useState<string[]>(['AC_001'])
  const [tab, setTab] = useState<'in' | 'out'>('in')
  const [mapOpen, setMapOpen] = useState(false)
  const [toast, setToast] = useState('')

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

  const aiPlace = () => {
    flash('✦ AI가 실 ' + Object.keys(ROOMS).length + '곳에 실내기를 자동 배치했습니다 (권장 모델 적용)')
  }

  return (
    <>
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
          <nav>
            <a href="#">대시보드</a>
            <a href="#">검도</a>
            <a href="#" className="on">생성</a>
          </nav>
        </div>
        <div className="r">
          <span>영업1팀 / 홍길동 (hong@lg.com)</span>
          <span>마이페이지</span>
          <span>로그아웃</span>
        </div>
      </div>

      <div className="sub">
        <a href="#" className="back">← 목록으로</a>
        <div className="title">생성 작업 — 실 검출 결과</div>
        <span className="b done">완료</span>
        <span className="b">검출 78개</span>
      </div>

      <ReportStrip
        rooms={ROOMS}
        groups={groups}
        pool={pool}
        onAiPlace={aiPlace}
        onOpenMap={() => setMapOpen(true)}
      />

      <div className="toolbar">
        <select className="field">
          <option>레이어: 전체</option>
          <option>실내기</option>
          <option>실외기</option>
          <option>실 경계</option>
        </select>
        <div className="sp" />
        <button className="btn sm">⭳ 결과 다운로드</button>
        <button className="btn sm">◉ 캡처</button>
      </div>

      <div className="stage">
        <Viewer rooms={ROOMS} selectedIds={selRooms} onSelectionChange={setSelRooms} onEscape={() => setMapOpen(false)} />
        <ModelPanel rooms={ROOMS} groups={groups} selRooms={selRooms} tab={tab} setTab={setTab} models={MODELS} />
      </div>
      <div className="bottom">▲ 장비 리스트</div>

      {toast && <div className="toast show">{toast}</div>}

      {mapOpen && (
        <MappingModal
          catalog={catalog.list()}
          groups={groups}
          pool={pool}
          onMove={moveRoom}
          onReplace={replaceModel}
          onSplit={splitGroup}
          onAddGroup={addGroup}
          onRemove={removeGroup}
          onClose={() => setMapOpen(false)}
          onApply={() => setMapOpen(false)}
        />
      )}
    </>
  )
}

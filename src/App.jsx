import { useState } from 'react'
import { ROOMS, INITIAL_GROUPS, INITIAL_POOL, MODELS } from './data.js'
import ReportStrip from './components/ReportStrip.jsx'
import Viewer from './components/Viewer.jsx'
import ModelPanel from './components/ModelPanel.jsx'
import MappingModal from './components/MappingModal.jsx'

export default function App() {
  const [groups, setGroups] = useState(INITIAL_GROUPS)
  const [pool, setPool] = useState(INITIAL_POOL)
  const [selRoom, setSelRoom] = useState('AC_001')
  const [tab, setTab] = useState('in')
  const [mapOpen, setMapOpen] = useState(false)
  const [placed, setPlaced] = useState(false)
  const [toast, setToast] = useState('')

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2600)
  }

  // 다음 실외기 그룹 key/label 생성
  const nextGroupMeta = () => {
    const nums = groups.map((g) => parseInt(g.key.replace('ODU', ''), 10) || 0)
    const n = (nums.length ? Math.max(...nums) : 0) + 1
    return { key: 'ODU' + n, label: '실외기-' + n }
  }

  // 실내기(id)를 대상(to = 그룹 key 또는 'pool')으로 이동. 호환 불가 시 false.
  const moveRoom = (id, to) => {
    if (to !== 'pool') {
      const g = groups.find((x) => x.key === to)
      if (g && ROOMS[id].sys !== g.sys) return false
    }
    setGroups((prev) =>
      prev.map((g) => {
        let items = g.items.filter((x) => x !== id)
        if (g.key === to && !items.includes(id)) items = [...items, id]
        return { ...g, items }
      }),
    )
    setPool((prev) => {
      let p = prev.filter((x) => x !== id)
      if (to === 'pool' && !p.includes(id)) p = [...p, id]
      return p
    })
    return true
  }

  // 실외기 모델 교체. 계열이 바뀌어 호환 안 되는 실내기는 미배정 풀로 반환.
  const replaceModel = (key, cat) => {
    const g = groups.find((x) => x.key === key)
    if (!g || !cat) return
    const incompatible = cat.sys !== g.sys ? g.items.filter((id) => ROOMS[id].sys !== cat.sys) : []
    setGroups((prev) =>
      prev.map((x) =>
        x.key === key
          ? { ...x, model: cat.model, cat: cat.cat, sys: cat.sys, cool: cat.cool, items: x.items.filter((id) => !incompatible.includes(id)) }
          : x,
      ),
    )
    if (incompatible.length) {
      setPool((prev) => [...prev, ...incompatible.filter((id) => !prev.includes(id))])
      flash(`실외기 교체: 계열이 달라 실내기 ${incompatible.length}개를 미배정으로 옮겼습니다`)
    } else {
      flash(`실외기 ${g.label} 모델을 ${cat.model}(으)로 교체했습니다`)
    }
  }

  // 그룹 분할: 실내기 절반을 같은 실외기 모델의 새 그룹으로 이동.
  const splitGroup = (key) => {
    const g = groups.find((x) => x.key === key)
    if (!g || g.items.length < 2) return
    const half = Math.ceil(g.items.length / 2)
    const keep = g.items.slice(0, half)
    const moved = g.items.slice(half)
    const meta = nextGroupMeta()
    setGroups((prev) => [
      ...prev.map((x) => (x.key === key ? { ...x, items: keep } : x)),
      { ...meta, model: g.model, cat: g.cat, sys: g.sys, cool: g.cool, items: moved },
    ])
    flash(`${g.label}을(를) 분할해 ${meta.label}을(를) 추가했습니다`)
  }

  // 실외기 그룹 추가 (빈 그룹).
  const addGroup = (cat) => {
    const meta = nextGroupMeta()
    setGroups((prev) => [...prev, { ...meta, model: cat.model, cat: cat.cat, sys: cat.sys, cool: cat.cool, items: [] }])
    flash(`${meta.label} (${cat.model})을(를) 추가했습니다`)
  }

  // 실외기 그룹 삭제: 연결된 실내기는 미배정 풀로 반환.
  const removeGroup = (key) => {
    const g = groups.find((x) => x.key === key)
    if (!g) return
    if (g.items.length) setPool((prev) => [...prev, ...g.items.filter((id) => !prev.includes(id))])
    setGroups((prev) => prev.filter((x) => x.key !== key))
    flash(`${g.label}을(를) 삭제했습니다`)
  }

  const aiPlace = () => {
    setPlaced(true)
    flash('✦ AI가 방 ' + Object.keys(ROOMS).length + '곳에 실내기를 자동 배치했습니다 (권장 모델 적용)')
    setTimeout(() => setPlaced(false), 1300)
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
        <div className="title">생성 작업 — 방 검출 결과</div>
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
          <option>방 경계</option>
        </select>
        <div className="sp" />
        <button className="btn sm">⭳ 결과 다운로드</button>
        <button className="btn sm">◉ 캡처</button>
      </div>

      <div className="stage">
        <Viewer rooms={ROOMS} selRoom={selRoom} placed={placed} onPick={setSelRoom} />
        <ModelPanel rooms={ROOMS} groups={groups} selRoom={selRoom} tab={tab} setTab={setTab} models={MODELS} />
      </div>
      <div className="bottom">▲ 장비 리스트</div>

      {toast && <div className="toast show">{toast}</div>}

      {mapOpen && (
        <MappingModal
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

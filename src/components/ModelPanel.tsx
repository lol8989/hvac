import { useMemo, useRef, useState } from 'react'
import { groupOfRoom } from '../data'
import type { Room, ModelCard } from '../data'
import type { GroupView } from '../presentation/generation/planAdapter'

interface ModelPanelProps {
  rooms: Record<string, Room>
  groups: GroupView[]
  selRooms: string[]
  tab: 'in' | 'out'
  setTab: (t: 'in' | 'out') => void
  models: { in: ModelCard[]; out: ModelCard[] }
  open: boolean
  width: number
  onToggle: () => void
  onWidthChange: (w: number) => void
  onSelectRoom: (id: string) => void // 선택에서 제거(✕)
  onFocusRoom: (id: string) => void // 대표 실로 포커스(행 본문 클릭)
  selModelIdx: number
  onSelectModel: (idx: number) => void
  onApply: () => void
  indoorByRoom: Record<string, string> // 실별 적용된 실내기 모델명
  aiRooms: Set<string> // AI가 자동 선정한 실(‘AI’ 표기)
}

const MIN_W = 260
const MAX_W = 560

// 장비마스터 게시본이 수백 종이라 목록은 검색·필터로 좁혀 쓴다.
// 실내기는 유형(4WAY 카세트/덕트 …), 실외기는 계열(EHP/GHP/수냉식 …)로 나눈다.
const facetOf = (tab: 'in' | 'out', m: ModelCard): string | undefined => (tab === 'in' ? m.kind : m.sys)
const FACET_LABEL = { in: '유형 필터', out: '계열 필터' } as const
const FACET_ALL = { in: '전체 유형', out: '전체 계열' } as const

// 실외기 냉난방 구분: 난방용량이 없으면 냉방전용이다(마스터 heatKw = null).
const HEAT_MODES = { ALL: '냉난방 전체', HEAT: '냉난방', COOL_ONLY: '냉방전용' } as const
type HeatMode = keyof typeof HEAT_MODES
const heatModeOf = (m: ModelCard): HeatMode => (m.heat ? 'HEAT' : 'COOL_ONLY')

// 우측 패널 — 실내기/실외기 모델 선택 전용 (용량 요약은 상단 리포트로 이관).
// 헤더 ◀ 버튼으로 접기/펼치기, 좌측 경계 드래그로 폭 조절.
export default function ModelPanel({
  rooms, groups, selRooms, tab, setTab, models, open, width, onToggle, onWidthChange, onSelectRoom,
  onFocusRoom, selModelIdx, onSelectModel, onApply, indoorByRoom, aiRooms,
}: ModelPanelProps) {
  // 실별 실내기 라벨: 적용(매핑)된 모델만 표기. 미적용은 '미지정'(추천은 표시하지 않음).
  const appliedModel = (id: string): string | null => indoorByRoom[id] ?? null
  const primary = selRooms[0] // 대표 실(상세 표시용)
  const sel = primary ? rooms[primary] : undefined
  const extra = selRooms.length - 1

  // 검색은 '검색' 버튼/Enter로만 제출한다 — 목록이 서버 조회로 바뀌면 타이핑마다 쿼리가 나가므로.
  // 계열·유형 필터는 선택지가 유한하고 결과를 좁히는 용도라 즉시 적용한다.
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('')
  const [facet, setFacet] = useState('ALL')
  const [seriesFilter, setSeriesFilter] = useState('ALL')
  const [heatMode, setHeatMode] = useState<'ALL' | HeatMode>('ALL')

  const cards = models[tab]

  // 탭이 바뀌면 필터 값이 다른 축을 가리키므로 초기화한다.
  const [prevTab, setPrevTab] = useState(tab)
  if (prevTab !== tab) {
    setPrevTab(tab)
    setFacet('ALL')
    setSeriesFilter('ALL')
    setHeatMode('ALL')
    setDraft('')
    setQ('')
  }

  const facets = useMemo(() => {
    const set = new Set<string>()
    for (const m of cards) {
      const f = facetOf(tab, m)
      if (f) set.add(f)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [cards, tab])

  // 시리즈 선택지는 앞선 필터(유형/계열·냉난방)를 반영해 좁힌다 — 결과 0건인 시리즈를 고르지 않도록.
  const seriesOptions = useMemo(() => {
    const set = new Set<string>()
    for (const m of cards) {
      if (facet !== 'ALL' && facetOf(tab, m) !== facet) continue
      if (tab === 'out' && heatMode !== 'ALL' && heatModeOf(m) !== heatMode) continue
      if (m.series) set.add(m.series)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [cards, tab, facet, heatMode])

  // 필터링해도 선택 인덱스는 원본 배열 기준을 유지한다(적용 로직이 인덱스를 쓴다).
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return cards
      .map((m, i) => ({ m, i }))
      .filter(
        ({ m }) =>
          (facet === 'ALL' || facetOf(tab, m) === facet) &&
          (tab === 'in' || heatMode === 'ALL' || heatModeOf(m) === heatMode) &&
          (seriesFilter === 'ALL' || m.series === seriesFilter) &&
          (!needle || m.mn.toLowerCase().includes(needle) || m.ms.toLowerCase().includes(needle)),
      )
  }, [cards, tab, q, facet, seriesFilter, heatMode])

  // 드래그 리사이즈: 패널 좌측 경계를 잡고 좌우로 움직여 폭 조절.
  const drag = useRef<{ startX: number; startW: number } | null>(null)

  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { startX: e.clientX, startW: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return
      // 패널은 우측에 고정 → 핸들을 왼쪽으로 끌면 폭이 커진다.
      const next = drag.current.startW + (drag.current.startX - ev.clientX)
      onWidthChange(Math.max(MIN_W, Math.min(MAX_W, next)))
    }
    const onUp = () => {
      drag.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 접힌 상태: 얇은 세로 레일 + 펼치기 버튼.
  if (!open) {
    return (
      <aside className="rpanel collapsed">
        <button className="rp-expand" onClick={onToggle} title="패널 펼치기" aria-label="패널 펼치기">
          ◀
        </button>
        <span className="rp-vlabel">모델 선택</span>
      </aside>
    )
  }

  return (
    <aside className="rpanel" style={{ width }}>
      <div className="rp-resizer" onPointerDown={onResizeDown} title="드래그하여 폭 조절" />
      <div className="rp-h">
        <span>실내기 / 실외기 모델 선택</span>
        <button className="x" onClick={onToggle} title="패널 접기" aria-label="패널 접기">▶</button>
      </div>
      <div className="rp-room">
        {sel ? (
          <>
            <span>{primary} ({sel.name}){extra > 0 ? ` 외 ${extra}실` : ''}</span>
            <span>{sel.type} · {sel.cool.toFixed(1)}kW · {sel.area.toFixed(2)}㎡</span>
          </>
        ) : (
          <span style={{ color: '#999' }}>선택된 실 없음</span>
        )}
      </div>
      <div className="rp-tabs">
        <button className={tab === 'in' ? 'on' : ''} onClick={() => setTab('in')}>실내기</button>
        <button className={tab === 'out' ? 'on' : ''} onClick={() => setTab('out')}>실외기</button>
      </div>
      <div className="rp-filter">
        <form
          className="rp-search"
          onSubmit={(e) => {
            e.preventDefault()
            setQ(draft)
          }}
          role="search"
        >
          <input
            className="field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="모델명·사양 검색"
            aria-label="모델 검색"
          />
          <button className="btn sm" type="submit" aria-label="검색">검색</button>
        </form>
        <div className="rp-facets">
          <select className="field" value={facet} onChange={(e) => setFacet(e.target.value)} aria-label={FACET_LABEL[tab]}>
            <option value="ALL">{FACET_ALL[tab]}</option>
            {facets.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {tab === 'out' && (
            <select
              className="field"
              value={heatMode}
              onChange={(e) => setHeatMode(e.target.value as 'ALL' | HeatMode)}
              aria-label="냉난방 구분 필터"
            >
              <option value="ALL">{HEAT_MODES.ALL}</option>
              <option value="HEAT">{HEAT_MODES.HEAT}</option>
              <option value="COOL_ONLY">{HEAT_MODES.COOL_ONLY}</option>
            </select>
          )}
        </div>
        <select
          className="field"
          value={seriesFilter}
          onChange={(e) => setSeriesFilter(e.target.value)}
          aria-label="시리즈 필터"
        >
          <option value="ALL">전체 시리즈</option>
          {seriesOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="rp-body">
        <div className="subttl">
          장비 리스트 <span className="rp-count">{visible.length} / {cards.length}건</span>
        </div>
        {visible.length === 0 && <div className="rp-empty">조건에 맞는 모델이 없습니다</div>}
        {visible.map(({ m, i }) => {
          const on = i === selModelIdx
          return (
          <div
            key={i}
            className={'mcard' + (on ? ' on' : '')}
            onClick={() => onSelectModel(i)}
            role="button"
            tabIndex={0}
          >
            {on && <span className="selbadge">선택됨</span>}
            <div className="mn">
              {m.mn}
              {m.series && <span className="mn-series">· {m.series}</span>}
            </div>
            <div className="ms">{m.ms}</div>
            {m.md && <div className="md">{m.md}</div>}
          </div>
          )
        })}
        {/* 선택된 실이 있을 때만(드래그/개별 선택) 리스트 노출. 평소엔 아예 없음. */}
        {selRooms.length > 0 && (
          <div className="subttl" style={{ marginTop: 12 }}><b>{selRooms.length}</b>개의 선택된 장비</div>
        )}
        {selRooms.filter((id) => rooms[id]).map((id) => {
          const g = groupOfRoom(groups, id)
          const model = appliedModel(id)
          return (
            <div
              key={id}
              className="selrow sel"
              onClick={() => onFocusRoom(id)}
              role="button"
              tabIndex={0}
              title="클릭하여 이 실을 대표로"
            >
              <span className="selrow-main">
                <span className="selrow-top">{id} <span style={{ color: '#999' }}>· {rooms[id].cool.toFixed(1)}kW</span></span>
                <span className={'selrow-idu' + (model ? '' : ' rec')}>
                  {model ? `${aiRooms.has(id) ? 'AI' : '실내기'} ${model}` : '미지정'}
                </span>
              </span>
              <span className="rt">{g ? g.label : '미배정'}</span>
              <button
                className="selrow-x"
                onClick={(e) => { e.stopPropagation(); onSelectRoom(id) }}
                title="선택에서 제거"
                aria-label="선택에서 제거"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <div className="rp-foot">
        <button className="btn primary" onClick={onApply}>모델 적용</button>
      </div>
    </aside>
  )
}

// 실외기 배치 단계의 컨텍스트 패널 — 배치 체크리스트.
// 선정된 실외기가 도면에 놓였는지 한눈에 보이고, 못 놓은 게 있으면 가드가 다음 단계를 막는다.

import type { GroupView } from '../../../presentation/generation/planAdapter'

interface OutdoorPanelProps {
  groups: GroupView[] // 연결 실내기가 있는 그룹만 넘긴다
  placedKeys: Set<string>
  violations: string[]
  onAutoPlace: () => void
}

export default function OutdoorPanel({ groups, placedKeys, violations, onAutoPlace }: OutdoorPanelProps) {
  if (groups.length === 0) {
    return <div className="rp-empty">배치할 실외기가 없습니다. 먼저 실외기를 선정하세요.</div>
  }
  const placed = groups.filter((g) => placedKeys.has(g.key)).length

  return (
    <>
      <div className="rp-room">
        <span>도면 배치</span>
        <span>{placed} / {groups.length}대</span>
      </div>

      <div className="subttl" style={{ marginTop: 12 }}>실외기</div>
      {groups.map((g) => {
        const done = placedKeys.has(g.key)
        return (
          <div key={g.key} className={'selrow' + (done ? '' : ' sel')}>
            <span className="selrow-main">
              <span className="selrow-top">{g.label} <span style={{ color: '#999' }}>· {g.model}</span></span>
              <span className={'selrow-idu' + (done ? '' : ' rec')}>
                {done ? '도면에 배치됨' : '미배치'} · {g.cool}kW · 연결 {g.unitCount}대
              </span>
            </span>
            <span className="rt">{done ? '✓' : '—'}</span>
          </div>
        )
      })}

      {violations.length > 0 && (
        <>
          <div className="subttl" style={{ marginTop: 12 }}>이격거리 경고</div>
          {violations.map((v) => (
            <div key={v} className="rp-warn">{v}</div>
          ))}
        </>
      )}

      <button className="btn sm" style={{ marginTop: 12, width: '100%' }} onClick={onAutoPlace}>
        ＋ 실외기 자동 배치
      </button>
    </>
  )
}

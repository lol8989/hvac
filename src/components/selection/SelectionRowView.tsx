import type { SelectionRow } from '../../domain/generation/SelectionTable'

// 모델 셀렉트 옵션 — 장비번호 코드만 필요(새 창 동기화 시 직렬화 가능하도록 클래스 비의존).
export interface IndoorModelOption { code: string }

// 편집 셀: 비제어 input + blur/Enter 커밋. 외부 값이 바뀌면 key로 리마운트되어 초기화된다.
function EditCell({ value, text, onCommit }: { value: string; text?: boolean; onCommit: (v: string) => void }) {
  return (
    <input
      key={value}
      className={'cell' + (text ? ' t' : '')}
      defaultValue={value}
      onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

const w = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })

export interface SelectionRowViewProps {
  row: SelectionRow
  floorSpan: number | null // 층 셀 rowSpan(섹션 첫 행) — 그 외 null
  groupOptions: readonly { key: string; label: string }[]
  indoorModels: readonly IndoorModelOption[]
  onRenameRoom: (roomId: string, name: string) => void
  onOverrideUnitLoad: (roomId: string, coolKcal: number, heatKcal: number) => void
  onResetUnitLoad: (roomId: string) => void
  onOverrideIndoor: (roomId: string, modelCode: string, quantity: number) => void
  onResetIndoor: (roomId: string) => void
  onMoveRoom: (roomId: string, to: string) => void
}

// 장비선정표 1행(=실 1개). 편집 셀: 실명·단위부하(냉/난)·모델·대수·그룹. 나머지 자동 계산.
export default function SelectionRowView({
  row, floorSpan, groupOptions, indoorModels,
  onRenameRoom, onOverrideUnitLoad, onResetUnitLoad, onOverrideIndoor, onResetIndoor, onMoveRoom,
}: SelectionRowViewProps) {
  const { unitLoad, requiredW, indoor, group, outdoor } = row
  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }
  const qty = (v: string) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : null }

  const commitUnitLoad = (cool: number | null, heat: number | null) => {
    if (cool === null || heat === null) return // 잘못된 입력은 무시(리마운트로 원복)
    onOverrideUnitLoad(row.roomId, cool, heat)
  }

  return (
    <tr>
      {floorSpan !== null && <td className="floorcell" rowSpan={floorSpan}>{row.floor}</td>}
      <td className="t">
        <EditCell text value={row.roomName} onCommit={(v) => onRenameRoom(row.roomId, v)} />
      </td>
      <td>{row.areaM2.toFixed(2)}</td>
      <td>
        <EditCell value={String(unitLoad.coolKcal)} onCommit={(v) => commitUnitLoad(num(v), unitLoad.heatKcal)} />
      </td>
      <td>
        <EditCell value={String(unitLoad.heatKcal)} onCommit={(v) => commitUnitLoad(unitLoad.coolKcal, num(v))} />
        {unitLoad.overridden
          ? <><span className="badge manual">수정</span><button className="reset" title="AI 기본값으로 초기화" onClick={() => onResetUnitLoad(row.roomId)}>↺</button></>
          : <span className="badge ai">AI</span>}
      </td>
      <td>{w(requiredW.cool)}</td>
      <td>{w(requiredW.heat)}</td>
      <td className="c">
        <select
          className="cell"
          value={indoor?.code ?? ''}
          onChange={(e) => { if (e.target.value) onOverrideIndoor(row.roomId, e.target.value, indoor?.quantity ?? 1) }}
        >
          <option value="" disabled>미지정</option>
          {indoorModels.map((m) => <option key={m.code} value={m.code}>{m.code}</option>)}
        </select>
      </td>
      <td className="t">{indoor?.model ?? ''}</td>
      <td>{indoor ? w(indoor.coolW) : ''}</td>
      <td>{indoor ? w(indoor.heatW) : ''}</td>
      <td className="c">
        {indoor ? (
          <>
            <EditCell value={String(indoor.quantity)} onCommit={(v) => { const q = qty(v); if (q !== null) onOverrideIndoor(row.roomId, indoor.code, q) }} />
            {indoor.overridden
              ? <><span className="badge manual">수정</span><button className="reset" title="AI 추천으로 초기화" onClick={() => onResetIndoor(row.roomId)}>↺</button></>
              : <span className="badge ai">AI</span>}
          </>
        ) : ''}
      </td>
      <td>{indoor ? w(indoor.totalCoolW) : ''}</td>
      <td>{indoor ? w(indoor.totalHeatW) : ''}</td>
      <td className="c">
        <select className="cell" value={group?.key ?? 'pool'} onChange={(e) => onMoveRoom(row.roomId, e.target.value)}>
          <option value="pool">미배정</option>
          {groupOptions.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
      </td>
      <td className="c">{outdoor ? `${outdoor.hp}HP` : ''}</td>
      <td className="t">{outdoor?.model ?? ''}</td>
      <td>{outdoor ? w(outdoor.coolKw * 1000) : ''}</td>
      <td>{outdoor ? (outdoor.heatKw !== null ? w(outdoor.heatKw * 1000) : '—') : ''}</td>
      <td className={outdoor ? (outdoor.judgement === 'OK' ? 'combo-ok' : 'combo-warn') : undefined}>
        {outdoor ? (
          <>
            {outdoor.comboRatio.toFixed(4)}
            {outdoor.judgement !== 'OK' && <span className="badge warn">{outdoor.judgement === 'OVERLOADED' ? '과부하' : '저부하'}</span>}
          </>
        ) : ''}
      </td>
    </tr>
  )
}

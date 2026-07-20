import type { SelectionRow } from '../../domain/generation/SelectionTable'
import { FALLBACK_KCAL } from '../../domain/shared/unitLoadTable'

// 모델 셀렉트 옵션 — 모델코드(식별자)만 필요(새 창 동기화 시 직렬화 가능하도록 클래스 비의존).
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
  rowClass?: string // 그룹 경계선 표시용(group-start 등)
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
  row, floorSpan, rowClass, groupOptions, indoorModels,
  onRenameRoom, onOverrideUnitLoad, onResetUnitLoad, onOverrideIndoor, onResetIndoor, onMoveRoom,
}: SelectionRowViewProps) {
  const { unitLoad, requiredW, indoor, group } = row
  const num = (v: string) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }
  const qty = (v: string) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? n : null }

  // 사용자가 단위부하를 직접 고친 행에서만 '적정 수치'인지 표기한다(AI 기본값은 표에서 나와 항상 적정).
  // 근거 범위(min~max)는 도메인이 실어 준다 — 표에 없는 실은 null이라 판정하지 않는다.
  const range = unitLoad.reasonableCoolKcal
  const showRange = unitLoad.overridden && range !== null
  const coolInRange = range ? unitLoad.coolKcal >= range.min && unitLoad.coolKcal <= range.max : true

  const commitUnitLoad = (cool: number | null, heat: number | null) => {
    if (cool === null || heat === null) return // 잘못된 입력은 무시(리마운트로 원복)
    onOverrideUnitLoad(row.roomId, cool, heat)
  }

  return (
    <tr className={rowClass}>
      {floorSpan !== null && <td className="floorcell" rowSpan={floorSpan}>{row.floor}</td>}
      <td className="t">
        {/* 입력이 width:100%라 배지를 그냥 두면 셀 밖(면적 열)으로 밀린다 — 한 줄 flex로 나눠 준다. */}
        <span className="namecell">
        <EditCell text value={row.roomName} onCommit={(v) => onRenameRoom(row.roomId, v)} />
        {/* 단위부하가 표에 근거 없이 기본값 150으로 떨어진 실만 표시한다. 근거가 있는 실
            (exact/normalized/alias)에 배지를 달면 모든 행에 붙어 정보가 없다.
            unknown과 unnamed는 조치가 다르므로 문구를 나눈다. */}
        {row.usageMatch === 'unknown' && (
          <span
            className="badge usage unknown"
            title={`'${row.roomName}'이(가) 단위부하표에 없어 기본값 ${FALLBACK_KCAL}kcal/h·㎡로 계산했습니다. 실명을 확인하거나 단위부하를 직접 입력하세요.`}
          >
            표에 없음
          </span>
        )}
        {row.usageMatch === 'unnamed' && (
          <span
            className="badge usage unnamed"
            title={`실명이 없어 기본값 ${FALLBACK_KCAL}kcal/h·㎡로 계산했습니다. 도면에 실명을 기입해야 정확해집니다.`}
          >
            실명 없음
          </span>
        )}
        </span>
      </td>
      <td>{row.areaM2.toFixed(2)}</td>
      <td>
        <EditCell value={String(unitLoad.coolKcal)} onCommit={(v) => commitUnitLoad(num(v), unitLoad.heatKcal)} />
        {showRange && (
          <span
            className={'badge range' + (coolInRange ? ' ok' : ' oor')}
            title={`적정 단위부하 범위 ${range!.min}~${range!.max} kcal/h·㎡ (실명·시설군 기준)`}
          >
            {coolInRange ? '적정' : `범위밖 ${range!.min}~${range!.max}`}
          </span>
        )}
      </td>
      <td>
        <EditCell value={String(unitLoad.heatKcal)} onCommit={(v) => commitUnitLoad(unitLoad.coolKcal, num(v))} />
        {/* AI 뱃지는 표시하지 않는다 — 기본값이 AI라는 사실은 모든 행에 붙어 정보가 없다.
            사람이 손댄 셀(수정)만 눈에 띄어야 한다. */}
        {unitLoad.overridden && (
          <><span className="badge manual">수정</span><button className="reset" title="AI 기본값으로 초기화" onClick={() => onResetUnitLoad(row.roomId)}>↺</button></>
        )}
      </td>
      <td>{w(requiredW.cool)}</td>
      <td>{w(requiredW.heat)}</td>
      {/* 장비번호는 **표시값**이다 — 유형·냉방용량에서 파생하며 서로 다른 모델이 같은 번호를 가질 수 있다.
          그래서 선택 위젯을 여기 두지 않는다. 모델 교체는 옆의 '실내기 모델명'(식별자) 칸에서 한다. */}
      <td className="c mono">{indoor?.code ?? ''}</td>
      <td className="t">
        <select
          className="cell t"
          value={indoor?.model ?? ''}
          onChange={(e) => { if (e.target.value) onOverrideIndoor(row.roomId, e.target.value, indoor?.quantity ?? 1) }}
        >
          <option value="" disabled>미지정</option>
          {indoorModels.map((m) => <option key={m.code} value={m.code}>{m.code}</option>)}
        </select>
      </td>
      <td>{indoor ? w(indoor.coolW) : ''}</td>
      <td>{indoor ? w(indoor.heatW) : ''}</td>
      <td className="c">
        {indoor ? (
          <>
            {/* 대수만 바꾼다 → 모델은 그대로. 여기 넘기는 건 **모델코드**다.
                indoor.code는 표시용 장비번호(파생·충돌 가능)라 카탈로그 조회 키가 아니다. */}
            <EditCell value={String(indoor.quantity)} onCommit={(v) => { const q = qty(v); if (q !== null) onOverrideIndoor(row.roomId, indoor.model, q) }} />
            {indoor.overridden && (
              <><span className="badge manual">수정</span><button className="reset" title="AI 추천으로 초기화" onClick={() => onResetIndoor(row.roomId)}>↺</button></>
            )}
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
      {/* 실외기·조합비는 그룹의 성질이다 → 행이 아니라 그룹 소계 행에 표기한다(SelectionGrid). */}
      <td className="c" />
      <td className="t" />
      <td />
      <td />
      <td />
    </tr>
  )
}

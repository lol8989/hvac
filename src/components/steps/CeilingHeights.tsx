// 프로젝트 설정 — 층별 천정고 입력.
//
// 천정고는 실이 아니라 층의 속성이다. 그래서 실 하나씩이 아니라 층 목록으로 받는다.
// 기본값 3.0m는 입력하지 않아도 적용된다(placeholder로 보여줄 뿐 값으로 채우지 않는다) —
// 채워 넣으면 "사용자가 3.0을 골랐다"와 "기본값을 그대로 뒀다"를 구분할 수 없다.
//
// 4m 이상을 넣으면 그 층은 특수부하가 되어 실내기 선정이 다시 돈다. 되돌리기 어려운 변경이므로
// StepGuard(CEILING_HEIGHT_CHANGE)가 확인을 받는다 — 여기서는 입력만 받고 판단하지 않는다.

import { useState } from 'react'
import {
  DEFAULT_CEILING_HEIGHT_M,
  SPECIAL_LOAD_MIN_HEIGHT_M,
  MIN_CEILING_HEIGHT_M,
  MAX_CEILING_HEIGHT_M,
  parseCeilingHeight,
  heightForFloor,
  type CeilingHeights as Heights,
} from '../../domain/generation/ceilingHeight'

export interface CeilingHeightsProps {
  floors: readonly string[]
  heights: Heights
  onChange: (floor: string, heightM: number) => void
}

export default function CeilingHeights({ floors, heights, onChange }: CeilingHeightsProps) {
  const [open, setOpen] = useState(false)
  // 편집 중인 원문(층 → 입력 문자열). 커밋 전까지 도메인 값과 분리한다 —
  // "4." 처럼 아직 숫자가 아닌 중간 상태를 매 키 입력마다 거부하면 타이핑을 할 수 없다.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<Record<string, string>>({})

  // 편집 종료 — 원문을 버리고 도메인 값으로 되돌아간다.
  // 키를 빈 문자열로 남기면 valueOf의 ??가 그것을 '유효한 원문'으로 보아 칸이 빈 채 굳는다.
  const clearDraft = (floor: string): void => {
    setDraft(({ [floor]: _drop, ...rest }) => rest)
    setError(({ [floor]: _dropErr, ...rest }) => rest)
  }

  const commit = (floor: string, raw: string): void => {
    const result = parseCeilingHeight(raw)
    if (!result.ok) {
      setError((e) => ({ ...e, [floor]: result.reason }))
      return
    }
    clearDraft(floor)
    if (result.value !== heightForFloor(heights, floor)) onChange(floor, result.value)
  }

  const valueOf = (floor: string): string =>
    draft[floor] ?? String(heightForFloor(heights, floor))

  const special = floors.filter((f) => heightForFloor(heights, f) >= SPECIAL_LOAD_MIN_HEIGHT_M)

  return (
    <div className="ceil-set">
      <button
        type="button"
        className="ceil-set__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`층별 천정고 (기본 ${DEFAULT_CEILING_HEIGHT_M}m)`}
      >
        천정고
        <span className="ceil-set__badge">
          {special.length > 0 ? `특수부하 ${special.length}개 층` : `${DEFAULT_CEILING_HEIGHT_M}m`}
        </span>
      </button>

      {open && (
        <div className="ceil-set__pop" role="group" aria-label="층별 천정고">
          <p className="ceil-set__hint">
            기본 {DEFAULT_CEILING_HEIGHT_M}m. {SPECIAL_LOAD_MIN_HEIGHT_M}m 이상이면 특수부하로 잡혀
            실내기 타입·대수가 바뀔 수 있습니다.
          </p>

          {floors.map((floor) => {
            const isSpecial = heightForFloor(heights, floor) >= SPECIAL_LOAD_MIN_HEIGHT_M
            return (
              <label key={floor} className="ceil-set__row">
                <span className="ceil-set__floor">{floor}</span>
                <input
                  className="field"
                  type="number"
                  inputMode="decimal"
                  step={0.1}
                  min={MIN_CEILING_HEIGHT_M}
                  max={MAX_CEILING_HEIGHT_M}
                  aria-label={`${floor} 천정고(m)`}
                  aria-invalid={Boolean(error[floor])}
                  value={valueOf(floor)}
                  onChange={(e) => setDraft((d) => ({ ...d, [floor]: e.target.value }))}
                  onBlur={(e) => commit(floor, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(floor, e.currentTarget.value)
                    if (e.key === 'Escape') clearDraft(floor)
                  }}
                />
                <span className="ceil-set__unit">m</span>
                {isSpecial && <span className="ceil-set__tag">특수부하</span>}
                {error[floor] && <span className="ceil-set__err">{error[floor]}</span>}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

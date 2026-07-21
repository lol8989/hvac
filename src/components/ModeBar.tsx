// 작업 모드 인디케이터 — 2페이즈: [편집] → [산출물].
//
// 예전엔 4스텝(실내기 배치→실외기 선정·조합→실외기 배치→산출물)을 순서대로 진행했으나,
// 실외기 '선정'은 사실상 자동/반응형이라(placements를 따라 syncPlanUnits가 플랜을 맞춘다)
// 세 편집 단계는 하나의 '편집 모드'로 묶고, 그 안의 도구는 자유롭게 오간다(주인님 결정 2026-07-21).
// 산출물은 '편집 확정'으로 넘어가고, '편집 재개'로 되열린다(잠금은 App이 관리).

import { STEPS } from '../presentation/generation/steps'
import type { StepId } from '../presentation/generation/steps'

interface ModeBarProps {
  current: StepId
  onPick: (id: StepId) => void // 편집 도구 선택(자유) / 산출물(=편집 확정) / 편집으로 복귀
}

const EDIT_TOOLS = STEPS.filter((s) => s.id !== 'output')
const OUTPUT = STEPS.find((s) => s.id === 'output')!

export default function ModeBar({ current, onPick }: ModeBarProps) {
  const inEdit = current !== 'output'
  return (
    <div className="modebar" role="navigation" aria-label="작업 모드">
      <div className={'mb-phase mb-edit' + (inEdit ? ' active' : '')}>
        <span className="mb-plabel">편집</span>
        <div className="mb-tools">
          {EDIT_TOOLS.map((s) => (
            <button
              key={s.id}
              className={'mb-tool' + (current === s.id ? ' on' : '')}
              onClick={() => onPick(s.id)}
              title={s.hint}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <span className="mb-sep">→</span>
      <button
        className={'mb-phase mb-output' + (!inEdit ? ' active' : '')}
        onClick={() => onPick('output')}
        title={inEdit ? '편집을 확정하고 산출물을 고정합니다' : OUTPUT.hint}
      >
        {!inEdit && '✓ '}{OUTPUT.label}
      </button>
    </div>
  )
}

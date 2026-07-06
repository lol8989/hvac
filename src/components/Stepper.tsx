import { Fragment } from 'react'
import { STEPS, stepIndex } from '../presentation/generation/steps'
import type { StepId } from '../presentation/generation/steps'

interface StepperProps {
  current: StepId
  onGo: (id: StepId) => void // 완료된(또는 현재) 단계로 이동
}

// 상단 진행 인디케이터 — 완료(✓)/진행중(●)/대기(○). 완료·현재 단계만 클릭 이동 가능.
export default function Stepper({ current, onGo }: StepperProps) {
  const ci = stepIndex(current)
  return (
    <div className="stepper" role="navigation" aria-label="작업 단계">
      {STEPS.map((s, i) => {
        const state = i < ci ? 'done' : i === ci ? 'active' : 'todo'
        const reachable = i <= ci
        return (
          <Fragment key={s.id}>
            {i > 0 && <span className={'step-line' + (i <= ci ? ' on' : '')} />}
            <button
              className={`step ${state}`}
              onClick={() => reachable && onGo(s.id)}
              disabled={!reachable}
              title={s.hint}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span className="step-no">{state === 'done' ? '✓' : s.no}</span>
              <span className="step-label">{s.label}</span>
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

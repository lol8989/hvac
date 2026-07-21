// 작업 바 — 되돌아가기 · 단계 인디케이터 · 현재 단계의 액션을 한 줄에 담는다.
//
// 예전에는 제목 바(44px) + 스텝퍼(40px) + 리포트 스트립(40px, 액션 포함) + 툴바(38px)가
// 따로 쌓여 도면 위 크롬이 210px였다. 제목("생성 작업 — 실외기 조합")과 카운터("3 / 5")는
// 스텝퍼가 이미 말하고 있어 중복이었다.
//
// 리포트(KPI)는 하단 상태바로 내렸다. 조합 리포트는 '읽는 값'이고 액션은 '누르는 것'이라
// 한 줄에 섞을 이유가 없다(SRP).

import type { ReactNode } from 'react'
import ModeBar from '../ModeBar'
import type { StepId } from '../../domain/generation/StepGuard'

interface WorkBarProps {
  current: StepId
  onPick: (id: StepId) => void
  actions: ReactNode
}

export default function WorkBar({ current, onPick, actions }: WorkBarProps) {
  return (
    <div className="workbar">
      <a href="#" className="wb-back">← 목록으로</a>
      <div className="wb-steps">
        <ModeBar current={current} onPick={onPick} />
      </div>
      <div className="wb-actions">{actions}</div>
    </div>
  )
}

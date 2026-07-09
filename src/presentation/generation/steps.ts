// 생성(Generation) 파이프라인의 작업 단계 정의 — presentation 전용, 순수/테스트 가능.
// (업로드는 목록의 '생성' 메뉴에서 완료된 것으로 가정)
// 실 검출 → AI 실내기 배치 → 실외기 배치 → 실외기 조합 → 산출물 생성.
// (실내기 미세조정은 별도 단계가 아니라 배치 단계 안에서 이동·회전·삭제로 수행한다)
// 장비선정표 검토는 파이프라인 스텝이 아니라 '새 창'에서 확인·조정한다(도면을 가리지 않기 위해).

export type StepId = 'detect' | 'place' | 'outdoor' | 'combine' | 'output'

export interface StepDef {
  id: StepId
  no: number // 1-based 표시 번호
  label: string
  hint: string // 스텝 점 툴팁/설명
}

export const STEPS: StepDef[] = [
  { id: 'detect', no: 1, label: '실 검출', hint: 'AI가 도면에서 실(공간)을 검출' },
  { id: 'place', no: 2, label: '실내기 배치', hint: 'AI가 실 면적·부하에 맞춰 실내기 자동 배치' },
  { id: 'outdoor', no: 3, label: '실외기 배치', hint: '조합 그룹별 실외기 심벌을 도면(건물 외부)에 배치' },
  { id: 'combine', no: 4, label: '실외기 조합', hint: '실외기 선정·조합 매핑 + 장비선정표 확인(새 창)' },
  { id: 'output', no: 5, label: '산출물 생성', hint: '장비선정표·도면 산출' },
]

export const stepIndex = (id: StepId): number => STEPS.findIndex((s) => s.id === id)
export const stepDef = (id: StepId): StepDef => STEPS[stepIndex(id)]
export const isLastStep = (id: StepId): boolean => stepIndex(id) === STEPS.length - 1
export const isFirstStep = (id: StepId): boolean => stepIndex(id) === 0

// 다음/이전 단계 id(양 끝은 클램프).
export const nextStep = (id: StepId): StepId => STEPS[Math.min(STEPS.length - 1, stepIndex(id) + 1)].id
export const prevStep = (id: StepId): StepId => STEPS[Math.max(0, stepIndex(id) - 1)].id

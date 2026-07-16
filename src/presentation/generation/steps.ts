// 생성(Generation) 파이프라인의 작업 단계 정의 — presentation 전용, 순수/테스트 가능.
// (업로드는 목록의 '생성' 메뉴에서 완료된 것으로 가정)
//
// 실 검출 → AI 실내기 배치 → 실외기 선정·조합 → 실외기 배치 → 산출물 생성.
//
// 순서의 근거: 실내기를 다 배치해야 총 정격용량이 확정되고, 그래야 그 용량을 감당할
// 실외기를 고를 수 있다(주인님 2026-07-10). 몇 대가 필요한지 정해져야 어디 둘지 정한다.
// 예전에는 '배치'가 '조합'보다 앞에 있었는데, 실제로는 배치 단계 진입 시 조합을 먼저
// 돌리고 있었다(라벨과 실행 순서가 반대).
//
// (실내기 미세조정은 별도 단계가 아니라 배치 단계 안에서 이동·회전·삭제로 수행한다)
// 장비선정표 검토는 파이프라인 스텝이 아니라 '새 창'에서 확인·조정한다(도면을 가리지 않기 위해).

// 단계 식별자와 진행 순서는 도메인 어휘다(StepGuard가 소유). 여기서는 라벨·번호·힌트만 갖는다.
export type { StepId } from '../../domain/generation/StepGuard'
import type { StepId } from '../../domain/generation/StepGuard'

export interface StepDef {
  id: StepId
  no: number // 1-based 표시 번호
  label: string
  hint: string // 스텝 점 툴팁/설명
}

// 실 검출은 파이프라인 스텝에서 뺐다 — 도면을 열면 실이 이미 검출된 상태로 시작한다.
// (검출 결과 다듬기(시설군·자르기·병합)는 첫 스텝인 '실내기 배치'에서 이어서 한다)
export const STEPS: StepDef[] = [
  { id: 'place', no: 1, label: '실내기 배치', hint: 'AI가 실 면적·부하에 맞춰 실내기 자동 배치' },
  { id: 'combine', no: 2, label: '실외기 선정·조합', hint: '확정된 실내기 정격용량으로 실외기를 선정하고 조합을 정한다' },
  { id: 'outdoor', no: 3, label: '실외기 배치', hint: '선정된 실외기 심벌을 도면(건물 외부)에 배치' },
  { id: 'output', no: 4, label: '산출물 생성', hint: '장비선정표·장비일람표·도면 산출' },
]

export const stepIndex = (id: StepId): number => STEPS.findIndex((s) => s.id === id)
export const stepDef = (id: StepId): StepDef => STEPS[stepIndex(id)]
export const isLastStep = (id: StepId): boolean => stepIndex(id) === STEPS.length - 1
export const isFirstStep = (id: StepId): boolean => stepIndex(id) === 0

// 다음/이전 단계 id(양 끝은 클램프).
export const nextStep = (id: StepId): StepId => STEPS[Math.min(STEPS.length - 1, stepIndex(id) + 1)].id
export const prevStep = (id: StepId): StepId => STEPS[Math.max(0, stepIndex(id) - 1)].id

// 게시 상태 (Equipment Master 컨텍스트).
// 게시 게이트: DRAFT → PUBLISHED → ARCHIVED. 검도·생성은 PUBLISHED만 조회한다(CLAUDE.md §4).
// 순수 도메인 — 프레임워크 무지.

import { EquipmentDomainError } from './errors'

export const PUBLISH_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const

export type PublishStatus = (typeof PUBLISH_STATUS)[keyof typeof PUBLISH_STATUS]

// 외부(검도·생성) 노출 가능 여부 = PUBLISHED만.
export const isPublished = (status: PublishStatus): boolean => status === PUBLISH_STATUS.PUBLISHED

// ── 상태 전이 불변식 (주인님 결정 2026-07-09: 선형 + 재게시) ──
// 게시 취소(PUBLISHED→DRAFT)·보관 해제(ARCHIVED→DRAFT)는 금지한다. 게시본을 되돌리면
// 이미 그 모델을 참조한 생성/검도 결과가 근거를 잃기 때문. 되살릴 때는 재게시(ARCHIVED→PUBLISHED).
const ALLOWED: Readonly<Record<PublishStatus, readonly PublishStatus[]>> = {
  [PUBLISH_STATUS.DRAFT]: [PUBLISH_STATUS.PUBLISHED, PUBLISH_STATUS.ARCHIVED],
  [PUBLISH_STATUS.PUBLISHED]: [PUBLISH_STATUS.ARCHIVED],
  [PUBLISH_STATUS.ARCHIVED]: [PUBLISH_STATUS.PUBLISHED],
}

export const canTransition = (from: PublishStatus, to: PublishStatus): boolean => ALLOWED[from].includes(to)

export function assertTransition(from: PublishStatus, to: PublishStatus): void {
  if (!canTransition(from, to)) {
    throw new EquipmentDomainError('INVALID_TRANSITION', `허용되지 않은 상태 전이입니다: ${from} → ${to}`)
  }
}

// ── 게시본 스펙 잠금 (주인님 결정 2026-07-09) ──
// 스펙(용량·HP·모델명 등) 수정은 DRAFT에서만. 단가는 이력 테이블(product_prices)이라 별개 규칙으로 허용.
export const canEditSpec = (status: PublishStatus): boolean => status === PUBLISH_STATUS.DRAFT

export function assertSpecEditable(status: PublishStatus): void {
  if (!canEditSpec(status)) {
    throw new EquipmentDomainError('SPEC_LOCKED', `${status} 상태의 제품은 스펙을 수정할 수 없습니다(작성중만 가능)`)
  }
}

// 게시 상태 (Equipment Master 컨텍스트).
// 게시 게이트: DRAFT → PUBLISHED → ARCHIVED. 검도·생성은 PUBLISHED만 조회한다(CLAUDE.md §4).
// 순수 도메인 — 프레임워크 무지.

export const PUBLISH_STATUS = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const

export type PublishStatus = (typeof PUBLISH_STATUS)[keyof typeof PUBLISH_STATUS]

// 외부(검도·생성) 노출 가능 여부 = PUBLISHED만.
export const isPublished = (status: PublishStatus): boolean => status === PUBLISH_STATUS.PUBLISHED

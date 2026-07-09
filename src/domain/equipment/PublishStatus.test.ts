import { describe, it, expect } from 'vitest'
import { PUBLISH_STATUS, isPublished } from './PublishStatus'

describe('PublishStatus (게시 게이트)', () => {
  it('DRAFT/PUBLISHED/ARCHIVED 3상태를 정의한다', () => {
    expect(Object.values(PUBLISH_STATUS).sort()).toEqual(['ARCHIVED', 'DRAFT', 'PUBLISHED'])
  })

  it('isPublished는 PUBLISHED만 참, 나머지는 거짓(외부 노출 게이트)', () => {
    expect(isPublished(PUBLISH_STATUS.PUBLISHED)).toBe(true)
    expect(isPublished(PUBLISH_STATUS.DRAFT)).toBe(false)
    expect(isPublished(PUBLISH_STATUS.ARCHIVED)).toBe(false)
  })
})

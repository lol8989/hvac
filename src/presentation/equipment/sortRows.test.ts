// 관리 목록 정렬 규칙 (주인님 지시 2026-07-10: 상태·등록일·수정일·게시일·HP·냉방 정렬).
import { describe, it, expect } from 'vitest'
import type { ProductRow } from '../../application/equipment/adminPorts'
import { sortRows, nextSortDirection, type SortState } from './sortRows'

const mk = (over: Partial<ProductRow>): ProductRow => ({
  id: 0, categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형', energySource: 'EHP',
  seriesCode: 'S', seriesName: 'S', modelCode: 'M', equipmentCode: null, horsepower: null, hpSource: null,
  coolingW: null, heatingW: null, maxConnections: null, status: 'DRAFT',
  createdAt: null, updatedAt: null, publishedAt: null, ...over,
})

const ids = (rows: readonly ProductRow[]) => rows.map((r) => r.id)
const sorted = (rows: ProductRow[], sort: SortState) => ids(sortRows(rows, sort))

describe('sortRows — 정렬 없음', () => {
  it('sort가 null이면 원본 순서를 그대로 둔다(저장소의 분류 정렬 순)', () => {
    const rows = [mk({ id: 3 }), mk({ id: 1 }), mk({ id: 2 })]
    expect(sorted(rows, null)).toEqual([3, 1, 2])
  })

  it('원본 배열을 변형하지 않는다', () => {
    const rows = [mk({ id: 2, horsepower: 20 }), mk({ id: 1, horsepower: 10 })]
    sortRows(rows, { key: 'horsepower', dir: 'asc' })
    expect(ids(rows)).toEqual([2, 1])
  })
})

describe('sortRows — 숫자 컬럼(HP · 냉방)', () => {
  it('HP 오름차순 · 내림차순', () => {
    const rows = [mk({ id: 1, horsepower: 28 }), mk({ id: 2, horsepower: 8 }), mk({ id: 3, horsepower: 104 })]
    expect(sorted(rows, { key: 'horsepower', dir: 'asc' })).toEqual([2, 1, 3])
    expect(sorted(rows, { key: 'horsepower', dir: 'desc' })).toEqual([3, 1, 2])
  })

  it('1HP 미만 소수도 정확히 정렬한다', () => {
    const rows = [mk({ id: 1, horsepower: 1 }), mk({ id: 2, horsepower: 0.34 }), mk({ id: 3, horsepower: 0.52 })]
    expect(sorted(rows, { key: 'horsepower', dir: 'asc' })).toEqual([2, 3, 1])
  })

  it('냉방용량 정렬', () => {
    const rows = [mk({ id: 1, coolingW: 65000 }), mk({ id: 2, coolingW: 2000 }), mk({ id: 3, coolingW: 302400 })]
    expect(sorted(rows, { key: 'coolingW', dir: 'desc' })).toEqual([3, 1, 2])
  })

  // 값이 없는 행을 방향에 따라 위아래로 튀게 하면, 정렬을 뒤집을 때마다 빈 행이 화면을 덮는다.
  it('값이 없는 행은 방향과 무관하게 항상 뒤로 보낸다', () => {
    const rows = [mk({ id: 1, horsepower: null }), mk({ id: 2, horsepower: 8 }), mk({ id: 3, horsepower: 28 })]
    expect(sorted(rows, { key: 'horsepower', dir: 'asc' })).toEqual([2, 3, 1])
    expect(sorted(rows, { key: 'horsepower', dir: 'desc' })).toEqual([3, 2, 1])
  })
})

describe('sortRows — 날짜 컬럼', () => {
  it('등록일·수정일·게시일을 시간순으로 정렬한다', () => {
    const rows = [
      mk({ id: 1, createdAt: '2026-07-09T10:00:00.000Z' }),
      mk({ id: 2, createdAt: '2026-07-08T09:00:00.000Z' }),
      mk({ id: 3, createdAt: '2026-07-10T11:00:00.000Z' }),
    ]
    expect(sorted(rows, { key: 'createdAt', dir: 'asc' })).toEqual([2, 1, 3])
    expect(sorted(rows, { key: 'createdAt', dir: 'desc' })).toEqual([3, 1, 2])
  })

  it('미게시(게시일 없음)는 항상 뒤로 간다', () => {
    const rows = [
      mk({ id: 1, publishedAt: null }),
      mk({ id: 2, publishedAt: '2026-07-01T00:00:00.000Z' }),
      mk({ id: 3, publishedAt: '2026-07-05T00:00:00.000Z' }),
    ]
    expect(sorted(rows, { key: 'publishedAt', dir: 'asc' })).toEqual([2, 3, 1])
    expect(sorted(rows, { key: 'publishedAt', dir: 'desc' })).toEqual([3, 2, 1])
  })
})

describe('sortRows — 상태 컬럼', () => {
  // 사전순(ARCHIVED < DRAFT < PUBLISHED)이 아니라 게시 흐름 순으로 정렬한다.
  it('오름차순은 게시 → 작성중 → 단종 순이다', () => {
    const rows = [mk({ id: 1, status: 'ARCHIVED' }), mk({ id: 2, status: 'DRAFT' }), mk({ id: 3, status: 'PUBLISHED' })]
    expect(sorted(rows, { key: 'status', dir: 'asc' })).toEqual([3, 2, 1])
    expect(sorted(rows, { key: 'status', dir: 'desc' })).toEqual([1, 2, 3])
  })
})

describe('sortRows — 안정성', () => {
  it('값이 같으면 원본 순서를 유지한다(안정 정렬)', () => {
    const rows = [mk({ id: 5, horsepower: 8 }), mk({ id: 2, horsepower: 8 }), mk({ id: 9, horsepower: 8 })]
    expect(sorted(rows, { key: 'horsepower', dir: 'asc' })).toEqual([5, 2, 9])
    expect(sorted(rows, { key: 'horsepower', dir: 'desc' })).toEqual([5, 2, 9])
  })
})

describe('nextSortDirection — 헤더 클릭 순환', () => {
  it('같은 컬럼을 누르면 오름 → 내림 → 해제로 순환한다', () => {
    expect(nextSortDirection(null, 'horsepower')).toEqual({ key: 'horsepower', dir: 'asc' })
    expect(nextSortDirection({ key: 'horsepower', dir: 'asc' }, 'horsepower')).toEqual({ key: 'horsepower', dir: 'desc' })
    expect(nextSortDirection({ key: 'horsepower', dir: 'desc' }, 'horsepower')).toBeNull()
  })

  it('다른 컬럼을 누르면 그 컬럼의 오름차순으로 시작한다', () => {
    expect(nextSortDirection({ key: 'horsepower', dir: 'desc' }, 'status')).toEqual({ key: 'status', dir: 'asc' })
  })
})

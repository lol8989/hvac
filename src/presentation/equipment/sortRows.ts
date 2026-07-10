// 관리 목록 정렬 — 순수 함수. React·저장소 무지.
//
// 정렬 가능한 컬럼은 "값에 순서가 있는" 것만이다(주인님 지시 2026-07-10).
// 분류·계열·시리즈·모델명은 이미 저장소가 분류 정렬 순으로 내려주므로 대상이 아니다.

import type { ProductRow } from '../../application/equipment/adminPorts'
import type { PublishStatus } from '../../domain/equipment/PublishStatus'

export type SortKey = 'status' | 'horsepower' | 'coolingW' | 'createdAt' | 'updatedAt' | 'publishedAt'
export type SortDir = 'asc' | 'desc'
export type SortState = { key: SortKey; dir: SortDir } | null

// 상태는 사전순(ARCHIVED < DRAFT < PUBLISHED)이 아니라 게시 흐름 순으로 늘어놓는다.
const STATUS_RANK: Record<PublishStatus, number> = { PUBLISHED: 0, DRAFT: 1, ARCHIVED: 2 }

// 비교 가능한 스칼라로 환원한다. 값이 없으면 null.
function valueOf(row: ProductRow, key: SortKey): number | string | null {
  switch (key) {
    case 'status':
      return STATUS_RANK[row.status]
    case 'horsepower':
      return row.horsepower
    case 'coolingW':
      return row.coolingW
    default:
      return row[key] // ISO 문자열 — 사전순 비교가 곧 시간순 비교다
  }
}

// 값 없는 행은 방향과 무관하게 항상 뒤로 보낸다.
// 방향에 따라 위아래로 튀면, 정렬을 뒤집을 때마다 빈 행이 화면을 덮는다.
function compare(a: ProductRow, b: ProductRow, key: SortKey, dir: SortDir): number {
  const va = valueOf(a, key)
  const vb = valueOf(b, key)
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1

  const sign = va < vb ? -1 : va > vb ? 1 : 0
  return dir === 'asc' ? sign : -sign
}

// 원본을 변형하지 않는다. Array.prototype.sort는 안정 정렬이므로 동값의 원본 순서가 유지된다.
export function sortRows(rows: readonly ProductRow[], sort: SortState): ProductRow[] {
  if (sort === null) return [...rows]
  return [...rows].sort((a, b) => compare(a, b, sort.key, sort.dir))
}

// 헤더 클릭: 같은 컬럼이면 오름 → 내림 → 해제로 순환하고, 다른 컬럼이면 그 컬럼의 오름차순으로 시작한다.
export function nextSortDirection(cur: SortState, key: SortKey): SortState {
  if (cur === null || cur.key !== key) return { key, dir: 'asc' }
  if (cur.dir === 'asc') return { key, dir: 'desc' }
  return null
}

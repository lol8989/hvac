// 테스트 전용: Placement 불변식(positions.length === quantity)을 채우는 더미 좌표.
// 좌표 값 자체가 검증 대상이 아닌 테스트에서 쓴다.

import type { UnitPosition } from '../domain/generation/layoutPositions'

export const POS = (n: number): UnitPosition[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0, rot: 0 }))

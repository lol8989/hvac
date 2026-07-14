// 생성(Generation) 편집 상태 — 되돌리기의 단위.
//
// 흩어진 useState 5개로는 원자적 스냅샷을 만들 수 없다. 실을 자르면 실·형상·배치가
// 함께 바뀌므로, Ctrl+Z 한 번에 함께 돌아와야 한다. 그래서 하나의 값으로 묶는다.
//
// UI 상태(선택·단계·패널 폭)는 여기 없다 — 되돌리기는 '편집'을 되돌리는 것이지 '보기'를 되돌리는 게 아니다.

import type { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import type { Room as DomainRoom } from '../../domain/generation/Room'
import type { Placement } from '../../domain/generation/Placement'
import type { Polygon } from '../../domain/shared/Polygon'
import type { FacilityType } from '../../domain/shared/unitLoadTable'

export interface World {
  plan: AssignmentPlan // 실외기 조합·배정
  rooms: Record<string, DomainRoom> // 검출된 실(부하·용도·면적)
  geom: Record<string, Polygon> // 실의 형상(베이스 좌표)
  placements: Record<string, Placement> // 실내기 배치(모델·대수·좌표)
  outdoorPositions: Record<string, { x: number; y: number }> // 실외기 심볼 좌표
  facility: FacilityType // 시설군(단위부하의 전제)
}

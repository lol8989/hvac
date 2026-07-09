// 게시 전제조건 — 순수 도메인.
//
// PUBLISHED가 되는 순간 생성·검도가 그 스펙을 읽어 값객체로 만든다. 그때 터지는 대신,
// 게시 시점에 막는다. 요건은 소비측 불변식에서 역산했다:
//   IndoorModel  — 냉방·난방 용량이 모두 양수
//   OutdoorUnit  — 냉방 용량·마력(HP)·최대 연결 실내기 수
// 환기(VENT)는 생성·검도가 읽지 않으므로 제약이 없다.
//
// 단가는 요건이 아니다(스펙시트에 단가가 없다). 단가 없는 실외기는 prices 빈 목록으로 노출된다.

export interface PublishCandidate {
  categoryCode: string // INDOOR / OUTDOOR / VENT
  modelCode: string
  coolingW: number | null
  heatingW: number | null
  horsepower: number | null
  maxConnections: number | null
}

const positive = (v: number | null): boolean => v !== null && Number.isFinite(v) && v > 0

// 게시를 막는 사유(한 문장). 게시 가능하면 null.
export function publishBlockReason(c: PublishCandidate): string | null {
  if (c.categoryCode === 'INDOOR') {
    if (!positive(c.coolingW)) return '냉방 용량이 없어 게시할 수 없습니다'
    if (!positive(c.heatingW)) return '난방 용량이 없어 게시할 수 없습니다'
    return null
  }

  if (c.categoryCode === 'OUTDOOR') {
    if (!positive(c.coolingW)) return '냉방 용량이 없어 게시할 수 없습니다'
    if (!positive(c.horsepower)) return '마력(HP)이 없어 게시할 수 없습니다'
    if (c.maxConnections === null || !Number.isInteger(c.maxConnections) || c.maxConnections < 1) {
      return '최대 연결 실내기 수가 없어 게시할 수 없습니다'
    }
    return null
  }

  return null // 환기 등 — 생성·검도 미소비
}

export const canPublish = (c: PublishCandidate): boolean => publishBlockReason(c) === null

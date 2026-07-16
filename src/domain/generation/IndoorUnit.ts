// 실내기 엔티티 (Generation Context). 동일성은 id로 판단.
// 원시값을 받아 내부에서 Capacity/EnergySource 값객체로 변환한다.
//
// IndoorUnit 1개 = 설치되는 실내기 '1대'다(실 1곳이 아니다).
// 한 실에 2대가 들어가면 IndoorUnit 2개가 생긴다. 이래야
//   ① 실외기 maxConnections(최대 '연결 대수')가 실제 대수를 센다
//   ② comboRatio가 설치 정격용량의 합이 된다(실 설계부하가 아니라)
// cool은 그 실내기 1대의 모델 정격 냉방용량이다.

import { Capacity } from '../shared/Capacity'
import { EnergySource } from '../shared/EnergySource'

// 실내기 유닛 id 규약: `${roomId}#${n}` (n은 1-based, 실 안에서의 대수 번호).
export const indoorUnitId = (roomId: string, n: number): string => `${roomId}#${n}`

export interface IndoorUnitProps {
  id: string
  roomId: string // 설치 대상 실. 한 실의 유닛들은 항상 같은 실외기 그룹에 함께 배정된다.
  roomName?: string
  coolKw: number | Capacity // 실내기 1대의 정격 냉방용량
  sys: string | EnergySource
  subcategory?: string // 실내기 유형(중분류) — 조합표 열 라벨(예: '4WAY 카세트'). 실외기 선정 호환 판정용.
  series?: string // 실내기 시리즈 — 조합표 열 라벨(예: 'Multi V 실내기(큐레이션)').
}

export class IndoorUnit {
  readonly id: string
  readonly roomId: string
  readonly roomName: string
  readonly cool: Capacity
  readonly energySource: EnergySource
  readonly subcategory: string
  readonly series: string

  constructor({ id, roomId, roomName, coolKw, sys, subcategory, series }: IndoorUnitProps) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('IndoorUnit.id는 비어 있을 수 없습니다')
    }
    if (typeof roomId !== 'string' || roomId.trim().length === 0) {
      throw new Error('IndoorUnit.roomId는 비어 있을 수 없습니다')
    }
    this.id = id
    this.roomId = roomId
    this.roomName = roomName ?? ''
    this.cool = coolKw instanceof Capacity ? coolKw : new Capacity(coolKw)
    this.energySource = sys instanceof EnergySource ? sys : new EnergySource(sys)
    this.subcategory = subcategory ?? ''
    this.series = series ?? ''
    Object.freeze(this)
  }

  // 엔티티 동일성: id만으로 판단(속성이 달라도 같은 실내기).
  equals(other: unknown): boolean {
    return other instanceof IndoorUnit && other.id === this.id
  }
}

// 유닛 목록에서 실 id를 등장 순서대로 유일하게 추출한다.
export const roomIdsOf = (units: readonly IndoorUnit[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const u of units) {
    if (!seen.has(u.roomId)) {
      seen.add(u.roomId)
      out.push(u.roomId)
    }
  }
  return out
}

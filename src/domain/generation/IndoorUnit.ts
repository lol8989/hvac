// 실내기 엔티티 (Generation Context). 동일성은 id로 판단.
// 원시값을 받아 내부에서 Capacity/EnergySource 값객체로 변환한다.

import { Capacity } from '../shared/Capacity'
import { EnergySource } from '../shared/EnergySource'

export interface IndoorUnitProps {
  id: string
  roomName?: string
  coolKw: number | Capacity
  sys: string | EnergySource
}

export class IndoorUnit {
  readonly id: string
  readonly roomName: string
  readonly cool: Capacity
  readonly energySource: EnergySource

  constructor({ id, roomName, coolKw, sys }: IndoorUnitProps) {
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new Error('IndoorUnit.id는 비어 있을 수 없습니다')
    }
    this.id = id
    this.roomName = roomName ?? ''
    this.cool = coolKw instanceof Capacity ? coolKw : new Capacity(coolKw)
    this.energySource = sys instanceof EnergySource ? sys : new EnergySource(sys)
    Object.freeze(this)
  }

  // 엔티티 동일성: id만으로 판단(속성이 달라도 같은 실내기).
  equals(other: unknown): boolean {
    return other instanceof IndoorUnit && other.id === this.id
  }
}

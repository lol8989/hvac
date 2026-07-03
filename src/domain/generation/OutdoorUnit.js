// 실외기 값객체 (Generation Context). 모델·계열·용량·최대 연결 수.
// 원시값을 받아 내부에서 ModelCode/EnergySource/Capacity 값객체로 변환한다.

import { Capacity } from '../shared/Capacity.js'
import { EnergySource } from '../shared/EnergySource.js'
import { ModelCode } from '../shared/ModelCode.js'

export const DEFAULT_MAX_CONNECTIONS = 16

export class OutdoorUnit {
  constructor({ model, category, sys, capacityKw, maxConnections }) {
    this.model = model instanceof ModelCode ? model : new ModelCode(model)
    this.category = category ?? ''
    this.energySource = sys instanceof EnergySource ? sys : new EnergySource(sys)
    this.capacity = capacityKw instanceof Capacity ? capacityKw : new Capacity(capacityKw)

    const max = maxConnections ?? DEFAULT_MAX_CONNECTIONS
    if (!Number.isInteger(max) || max <= 0) {
      throw new Error('maxConnections는 1 이상의 정수여야 합니다')
    }
    this.maxConnections = max
    Object.freeze(this)
  }

  equals(other) {
    return (
      other instanceof OutdoorUnit &&
      other.model.equals(this.model) &&
      other.energySource.equals(this.energySource) &&
      other.capacity.equals(this.capacity) &&
      other.maxConnections === this.maxConnections
    )
  }
}

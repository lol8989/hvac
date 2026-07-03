// OutdoorModelCatalog 포트의 인메모리 어댑터 (POC).
// 장비마스터 PUBLISHED 실외기 스펙 목업(data.ts ODU_CATALOG)을 표준 스펙 계약으로 매핑한다.
// 추후 장비마스터 API 클라이언트 구현으로 교체 가능.

import type { OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'
import { ODU_CATALOG } from '../../data'

// data.ts의 레거시 필드명(cat/sys/cool) → 표준 스펙 계약으로 변환
const toSpec = (e: (typeof ODU_CATALOG)[number]): OutdoorModelSpec => ({
  model: e.model,
  category: e.cat,
  energySource: e.sys,
  capacityKw: e.cool,
  maxConnections: e.maxConn,
})

export class InMemoryOutdoorModelCatalog implements OutdoorModelCatalog {
  private readonly _specs: OutdoorModelSpec[] = ODU_CATALOG.map(toSpec)

  list(): OutdoorModelSpec[] {
    return [...this._specs]
  }

  findByModel(model: string): OutdoorModelSpec | undefined {
    return this._specs.find((s) => s.model === model)
  }
}

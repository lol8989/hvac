// OutdoorModelCatalog 포트의 인메모리 어댑터 (POC).
// 장비마스터 PUBLISHED 실외기 스펙 목업(data.ts ODU_CATALOG)을 표준 스펙 계약으로 매핑한다.
// 추후 장비마스터 API 클라이언트 구현으로 교체 가능.

import type { OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'
import { ComboRange } from '../../domain/shared/ComboRange'
import { ODU_CATALOG } from '../../data'

// data.ts의 레거시 필드명(cat/sys/cool) → 표준 스펙 계약으로 변환.
// 단가는 현행 소비자가 1건을 게시 엔트리 목록(prices)으로 담는다(게시뷰 계약 형태).
// 조합비 범위: comboMin/Max가 기재된 제품군은 정책값, 미지정은 기본(0.5~1.3).
export const toOutdoorModelSpec = (e: (typeof ODU_CATALOG)[number]): OutdoorModelSpec => ({
  model: e.model,
  category: e.cat,
  energySource: e.sys,
  capacityKw: e.cool,
  heatKw: e.heatKw,
  hp: e.hp,
  comboRange: e.comboMin !== undefined && e.comboMax !== undefined ? new ComboRange(e.comboMin, e.comboMax) : ComboRange.DEFAULT,
  maxConnections: e.maxConn,
  prices: [
    {
      priceTypeCode: e.priceTypeCode,
      priceKrw: e.priceKrw,
      priceWithVatKrw: e.priceWithVatKrw,
      effectiveStartDate: e.effectiveStartDate,
      priority: e.priority,
      sourceReference: 'ODU_CATALOG(목업)',
    },
  ],
  efficiencyGradeId: e.efficiencyGradeId,
  copCooling: e.copCooling,
  copHeating: e.copHeating,
})

export class InMemoryOutdoorModelCatalog implements OutdoorModelCatalog {
  private readonly _specs: OutdoorModelSpec[] = ODU_CATALOG.map(toOutdoorModelSpec)

  list(): OutdoorModelSpec[] {
    return [...this._specs]
  }

  findByModel(model: string): OutdoorModelSpec | undefined {
    return this._specs.find((s) => s.model === model)
  }
}

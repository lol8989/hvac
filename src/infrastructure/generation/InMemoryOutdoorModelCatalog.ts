// OutdoorModelCatalog 포트의 어댑터 (생성 컨텍스트).
// 시드를 직접 소유하지 않고 장비마스터(Equipment Master)의 PUBLISHED 실외기 스펙을 참조해
// 표준 스펙 계약(OutdoorModelSpec)으로 변환한다(마스터가 SSOT, 생성 단은 참조만 — CLAUDE.md §1).

import type { OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'
import type { EquipmentMaster } from '../../domain/equipment/EquipmentMaster'
import type { OutdoorSpecFields } from '../../domain/equipment/MasterRecord'
import { ComboRange } from '../../domain/shared/ComboRange'
import { defaultEquipmentMaster } from '../equipment/InMemoryEquipmentMaster'

// 마스터 레코드의 레거시 필드명(cat/sys/cool) → 표준 스펙 계약으로 변환.
// 단가는 현행 소비자가 1건을 게시 엔트리 목록(prices)으로 담는다(게시뷰 계약 형태).
// 현행가가 없는 모델(스펙시트 실데이터 대부분)은 빈 목록 — 소비측은 단가 미상으로 처리한다.
// 조합비 범위: comboMin/Max가 기재된 제품군은 정책값, 미지정은 기본(0.5~1.3).
export const toOutdoorModelSpec = (e: OutdoorSpecFields): OutdoorModelSpec => ({
  model: e.model,
  category: e.cat,
  energySource: e.sys,
  capacityKw: e.cool,
  heatKw: e.heatKw,
  hp: e.hp,
  comboRange: e.comboMin !== undefined && e.comboMax !== undefined ? new ComboRange(e.comboMin, e.comboMax) : ComboRange.DEFAULT,
  maxConnections: e.maxConn,
  prices:
    e.priceKrw === undefined
      ? []
      : [
          {
            priceTypeCode: e.priceTypeCode ?? 'CONSUMER',
            priceKrw: e.priceKrw,
            priceWithVatKrw: e.priceWithVatKrw ?? null,
            effectiveStartDate: e.effectiveStartDate ?? '1970-01-01',
            priority: e.priority ?? 0,
            sourceReference: '장비마스터(PUBLISHED)',
          },
        ],
  efficiencyGradeId: e.efficiencyGradeId,
  copCooling: e.copCooling,
  copHeating: e.copHeating,
})

export class InMemoryOutdoorModelCatalog implements OutdoorModelCatalog {
  private readonly _specs: OutdoorModelSpec[]

  constructor(master: EquipmentMaster = defaultEquipmentMaster) {
    this._specs = master.publishedOutdoor().map(toOutdoorModelSpec)
  }

  list(): OutdoorModelSpec[] {
    return [...this._specs]
  }

  findByModel(model: string): OutdoorModelSpec | undefined {
    return this._specs.find((s) => s.model === model)
  }
}

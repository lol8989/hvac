// 실내기 모델 카탈로그 어댑터 (IndoorModelCatalog 포트 구현).
// 시드를 직접 소유하지 않고 장비마스터(Equipment Master)의 PUBLISHED 실내기 스펙을 참조한다
// (마스터가 SSOT, 생성 단은 참조만 — CLAUDE.md §1). 마스터 레코드 → 도메인 VO(IndoorModel) 변환.

import { IndoorModel } from '../../domain/generation/IndoorModel'
import type { IndoorModelCatalog } from '../../application/generation/ports'
import type { EquipmentMaster } from '../../domain/equipment/EquipmentMaster'
import { defaultEquipmentMaster } from '../equipment/InMemoryEquipmentMaster'

export class InMemoryIndoorModelCatalog implements IndoorModelCatalog {
  private readonly models: readonly IndoorModel[]

  constructor(master: EquipmentMaster = defaultEquipmentMaster) {
    this.models = Object.freeze(
      master.publishedIndoor().map(
        (m) => new IndoorModel({ code: m.code, model: m.model, coolW: m.coolW, heatW: m.heatW, type: m.type, series: m.series, energySource: m.energySource }),
      ),
    )
  }

  list(): readonly IndoorModel[] {
    return this.models
  }

  byCode(code: string): IndoorModel | null {
    return this.models.find((m) => m.code === code) ?? null
  }

  byModel(model: string): IndoorModel | null {
    return this.models.find((m) => m.model === model) ?? null
  }
}

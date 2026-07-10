// 단위부하 값객체 (Shared Kernel · Value Object). 단위 kcal/h·㎡.
// 불변 + 자기검증. W 변환(×1.163)과 면적 기반 필요부하량 계산을 제공한다.
// 근거: LG 장비선정표 엑셀(표준 260415) — 단위부하(kcal) → W 변환 → 필요부하량.

import { lookupUnitLoadKcal, type FacilityType, type LoadIntensity } from './unitLoadTable'

export const KCAL_TO_W = 1.163

const assertPositiveFinite = (v: number, name: string): void => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`${name}은(는) 0보다 큰 유한수여야 합니다`)
  }
}

export class UnitLoad {
  constructor(
    readonly coolKcal: number,
    readonly heatKcal: number,
  ) {
    assertPositiveFinite(coolKcal, 'coolKcal')
    assertPositiveFinite(heatKcal, 'heatKcal')
    Object.freeze(this)
  }

  get coolW(): number {
    return this.coolKcal * KCAL_TO_W
  }

  get heatW(): number {
    return this.heatKcal * KCAL_TO_W
  }

  // 면적(㎡) 기준 필요부하량(W) = 단위부하(W/㎡) × 면적
  requiredLoadW(areaM2: number): { cool: number; heat: number } {
    assertPositiveFinite(areaM2, 'areaM2')
    return { cool: this.coolW * areaM2, heat: this.heatW * areaM2 }
  }

  equals(o: UnitLoad): boolean {
    return o instanceof UnitLoad && o.coolKcal === this.coolKcal && o.heatKcal === this.heatKcal
  }
}

// 시설군·용도별 단위부하 (kcal/h·㎡). 표는 unitLoadTable.ts (LG전자 단위부하 참고자료).
//
// ⚠️ 표는 냉방 부하만 제공한다. 난방 단위부하 자료가 없어 냉방값을 그대로 쓴다(기존 목업과 동일).
//    난방 실측 자료가 들어오면 여기만 바꾸면 된다.
export const unitLoadForUsage = (facility: FacilityType, usage: string, intensity: LoadIntensity = 'STANDARD'): UnitLoad => {
  const kcal = lookupUnitLoadKcal(facility, usage, intensity)
  return new UnitLoad(kcal, kcal)
}

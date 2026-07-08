// 단위부하 값객체 (Shared Kernel · Value Object). 단위 kcal/h·㎡.
// 불변 + 자기검증. W 변환(×1.163)과 면적 기반 필요부하량 계산을 제공한다.
// 근거: LG 장비선정표 엑셀(표준 260415) — 단위부하(kcal) → W 변환 → 필요부하량.

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

// 용도별 기본 단위부하 시드 (kcal/h·㎡, 냉=난 동일값 목업)
export const DEFAULT_UNIT_LOADS: Record<string, { cool: number; heat: number }> = Object.freeze({
  거실: { cool: 170, heat: 170 },
  침실: { cool: 150, heat: 150 },
  회의실: { cool: 170, heat: 170 },
  사무실: { cool: 180, heat: 180 },
  로비: { cool: 180, heat: 180 },
  탕비실: { cool: 150, heat: 150 },
  시청각실: { cool: 140, heat: 140 },
  준비실: { cool: 150, heat: 150 },
  교장실: { cool: 160, heat: 160 },
  보건실: { cool: 170, heat: 170 },
  미술실: { cool: 180, heat: 180 },
  기술실: { cool: 180, heat: 180 },
  행정실: { cool: 180, heat: 180 },
})

// 미등록 용도 기본값
const FALLBACK = { cool: 170, heat: 170 }

export const unitLoadForUsage = (usage: string): UnitLoad => {
  const seed = DEFAULT_UNIT_LOADS[usage] ?? FALLBACK
  return new UnitLoad(seed.cool, seed.heat)
}

// 조합표(CompatMatrix) → 실외기 선정 호환 판정(CompatPredicate) 어댑터.
//
// 생성단이 장비마스터의 호환 기준표를 소비하는 지점(Customer/Supplier — 생성이 하류).
// 하이브리드: 조합표에 그 (실외기 시리즈×실내기 유형) 셀이 있으면 그 값을 따르고(O·D=연결 가능),
// 없으면 계열(EnergySource) 일치로 폴백한다. 시드/목업 라벨이 조합표와 안 맞아도 선정이 깨지지 않도록.

import type { CompatMatrix } from '../../domain/equipment/CompatMatrix'
import type { CompatPredicate } from '../../domain/generation/selectOutdoorUnits'

export const compatPredicateFromMatrix =
  (matrix: CompatMatrix): CompatPredicate =>
  (outdoor, indoor) => {
    // 라벨이 없으면 조합표를 조회할 수 없다 → 계열 폴백.
    if (!outdoor.subcategory || !outdoor.series || !indoor.subcategory || !indoor.series) {
      return outdoor.energySource === indoor.energySource
    }
    const v = matrix.tryValueAt(
      { subcategory: outdoor.subcategory, series: outdoor.series },
      { subcategory: indoor.subcategory, series: indoor.series },
    )
    if (v === null) return outdoor.energySource === indoor.energySource // 조합표에 없는 축 → 계열 폴백
    return v === 'O' || v === 'D'
  }

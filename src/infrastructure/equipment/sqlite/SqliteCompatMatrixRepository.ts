// 실내기↔실외기 호환 기준표 리포지토리 — series_compat(override 전용)에 '바꾼 칸만' 저장.
// 축은 게시 시리즈(카탈로그)에서 오고, 기본값은 시드(현업 확정값 ?? 'X')다.

import { isCompatValue, type CompatMatrix, type CompatValue, type CompatAxis } from '../../../domain/equipment/CompatMatrix'
import { EquipmentDomainError } from '../../../domain/equipment/errors'
import { readCompatMatrix, compatAxisExists, compatDefaultValue } from './readCompatMatrix'
import type { SqliteTx } from './SqliteTx'

export class SqliteCompatMatrixRepository {
  constructor(private readonly tx: SqliteTx) {}

  private get db() {
    return this.tx.db
  }

  getCompatMatrix(): CompatMatrix {
    return readCompatMatrix(this.db)
  }

  setCompatCell(
    outdoor: Pick<CompatAxis, 'subcategory' | 'series'>,
    indoor: Pick<CompatAxis, 'subcategory' | 'series'>,
    value: CompatValue,
  ): void {
    // 값이 유효하고 축이 카탈로그에 실재하는지 검증한다. 축은 게시 시리즈에서 오므로 시드가 아니라 카탈로그로 확인한다.
    if (!isCompatValue(value)) throw new EquipmentDomainError('INVALID_FIELD', `유효하지 않은 조합 값입니다: ${String(value)}`)
    if (!compatAxisExists(this.db, outdoor, 'OUTDOOR') || !compatAxisExists(this.db, indoor, 'INDOOR')) {
      throw new EquipmentDomainError('INVALID_FIELD', `알 수 없는 축: 실외기 '${outdoor.series}' × 실내기 '${indoor.series}'`)
    }
    const defaultValue = compatDefaultValue(outdoor, indoor) // 시드 ?? 'X' — getCompatMatrix와 같은 기본값
    this.tx.run(() => {
      if (value === defaultValue) {
        // 기본값과 같아지면 override를 걷어낸다 — series_compat엔 '바꾼 칸만' 남는다(스키마 불변식).
        // 안 그러면 스테일 override가 훗날 시드 개정을 조용히 마스킹한다(조합비 override의 null 되돌리기와 동일 정책).
        this.db.run(
          `DELETE FROM series_compat WHERE outdoor_subcategory=? AND outdoor_series=? AND indoor_subcategory=? AND indoor_series=?`,
          [outdoor.subcategory, outdoor.series, indoor.subcategory, indoor.series],
        )
      } else {
        this.db.run(
          `INSERT INTO series_compat (outdoor_subcategory, outdoor_series, indoor_subcategory, indoor_series, value)
           VALUES (?,?,?,?,?)
           ON CONFLICT(outdoor_subcategory, outdoor_series, indoor_subcategory, indoor_series)
           DO UPDATE SET value = excluded.value`,
          [outdoor.subcategory, outdoor.series, indoor.subcategory, indoor.series, value],
        )
      }
    })
  }

  // 한 실외기 시리즈의 모든 override를 걷어내 시드(현업 확정 기본값)로 되돌린다.
  clearCompatForOutdoor(outdoor: Pick<CompatAxis, 'subcategory' | 'series'>): void {
    this.tx.run(() => {
      this.db.run(`DELETE FROM series_compat WHERE outdoor_subcategory=? AND outdoor_series=?`, [outdoor.subcategory, outdoor.series])
    })
  }
}

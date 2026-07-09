// 장비마스터 관리 리포지토리 SQLite 어댑터 (EquipmentAdminRepository 구현).
// 게시 상태 무관 전 제품을 4단 분류 조인으로 평탄 조회한다. (쓰기는 후속 슬라이스에서 추가.)

import type { Database } from 'sql.js'
import type { EquipmentAdminRepository, ProductRow } from '../../../application/equipment/adminPorts'
import type { PublishStatus } from '../../../domain/equipment/PublishStatus'
import { queryRows, numOrNull, strOrNull } from './query'

const LIST_SQL = `
  SELECT p.id, c.code AS category_code, c.name_ko AS category_name,
         sc.name_ko AS subcategory_name, sc.energy_source,
         s.name_ko AS series_name, p.model_code, p.equipment_code,
         p.horsepower, p.cooling_capacity_w, p.heating_capacity_w, p.status,
         pp.price_krw
  FROM products p
  JOIN product_series s        ON p.series_id = s.id
  JOIN product_subcategories sc ON s.subcategory_id = sc.id
  JOIN product_categories c     ON sc.category_id = c.id
  LEFT JOIN product_prices pp   ON pp.product_id = p.id AND pp.effective_end_date IS NULL
  ORDER BY c.sort_order, p.id
`

export class SqliteEquipmentAdminRepository implements EquipmentAdminRepository {
  constructor(private readonly db: Database) {}

  listProducts(): ProductRow[] {
    return queryRows(this.db, LIST_SQL).map((r) => ({
      id: r.id as number,
      categoryCode: String(r.category_code),
      categoryName: String(r.category_name),
      subcategoryName: String(r.subcategory_name),
      energySource: strOrNull(r.energy_source),
      seriesName: String(r.series_name),
      modelCode: String(r.model_code),
      equipmentCode: strOrNull(r.equipment_code),
      horsepower: numOrNull(r.horsepower),
      coolingW: numOrNull(r.cooling_capacity_w),
      heatingW: numOrNull(r.heating_capacity_w),
      status: String(r.status) as PublishStatus,
      priceKrw: numOrNull(r.price_krw),
    }))
  }
}

// 시드 데이터(SeedData) → 4단 분류 정규화 행 적재.
// 원천은 LG 스펙시트 50개를 훑은 빌드 산출물(public/equipment-seed.json, scripts/buildSpecSeed.ts).
// products.id는 배열 순서대로 부여되며, 그 순서가 곧 생성/검도가 보는 PUBLISHED 목록 순서다.

import type { Database } from 'sql.js'
import type { SeedData } from '../seed/seedTypes'

// 단가 유형은 POC상 소비자가(CONSUMER=1) 하나만 쓴다.
const CONSUMER_PRICE_TYPE_ID = 1

export function seedDatabase(db: Database, data: SeedData): void {
  const categoryId = new Map<string, number>()
  const subcategoryId = new Map<string, number>()
  const seriesId = new Map<string, number>()
  const productId = new Map<string, number>()

  data.categories.forEach((c, i) => {
    const id = i + 1
    categoryId.set(c.code, id)
    db.run(`INSERT INTO product_categories (id, code, name_ko, sort_order) VALUES (?,?,?,?)`, [id, c.code, c.nameKo, c.sortOrder])
  })

  data.subcategories.forEach((s, i) => {
    const id = i + 1
    subcategoryId.set(s.code, id)
    db.run(`INSERT INTO product_subcategories (id, category_id, code, name_ko, energy_source) VALUES (?,?,?,?,?)`, [
      id,
      categoryId.get(s.categoryCode)!,
      s.code,
      s.nameKo,
      s.energySource,
    ])
  })

  data.series.forEach((s, i) => {
    const id = i + 1
    seriesId.set(s.code, id)
    db.run(`INSERT INTO product_series (id, subcategory_id, code, name_ko, mfl_code) VALUES (?,?,?,?,?)`, [
      id,
      subcategoryId.get(s.subcategoryCode)!,
      s.code,
      s.nameKo,
      s.mflCode,
    ])
  })

  for (let g = 1; g <= 5; g++) db.run(`INSERT INTO efficiency_grades (id, name) VALUES (?,?)`, [g, `${g}등급`])
  db.run(`INSERT INTO price_types (id, code, name_ko, priority) VALUES (?,?,?,?)`, [CONSUMER_PRICE_TYPE_ID, 'CONSUMER', '소비자가', 10])

  const insertProduct = `INSERT INTO products
    (id, series_id, model_code, equipment_code, horsepower, cooling_capacity_w, heating_capacity_w,
     max_connections, efficiency_grade_id, cop_cooling, cop_heating, status, discontinued_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  const insertSpec = `INSERT INTO product_specs (product_id, spec_data) VALUES (?,?)`

  data.products.forEach((p, i) => {
    const id = i + 1
    productId.set(p.modelCode, id)
    db.run(insertProduct, [
      id,
      seriesId.get(p.seriesCode)!,
      p.modelCode,
      p.equipmentCode,
      p.horsepower,
      p.coolingW,
      p.heatingW,
      p.maxConnections,
      p.efficiencyGradeId,
      p.copCooling,
      p.copHeating,
      p.status,
      p.status === 'ARCHIVED' ? '2024-01-01' : null,
    ])
    // 롱테일 스펙이 없는 목업 모델은 빈 행을 만들지 않는다.
    if (Object.keys(p.specData).length) db.run(insertSpec, [id, JSON.stringify(p.specData)])
  })

  const insertPrice = `INSERT INTO product_prices
    (product_id, price_type_id, price_krw, price_with_vat_krw, effective_start_date, effective_end_date, source_reference, priority)
    VALUES (?,?,?,?,?,NULL,?,?)`
  for (const pr of data.prices) {
    const pid = productId.get(pr.modelCode)
    if (!pid) continue // 단가만 있고 제품이 없는 경우는 무시
    db.run(insertPrice, [pid, CONSUMER_PRICE_TYPE_ID, pr.priceKrw, pr.priceWithVatKrw, pr.effectiveStartDate, '장비마스터(목업 단가)', pr.priority])
  }
}

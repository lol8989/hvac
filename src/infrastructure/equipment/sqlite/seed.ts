// 공유 시드(INDOOR_RECORDS·OUTDOOR_RECORDS, 평탄 레코드)를 4단 분류 정규화 행으로 적재한다.
// 마스터 SSOT는 SQLite. 인메모리 마스터와 동일 데이터를 재현해야 한다(동치 테스트로 고정).

import type { Database } from 'sql.js'
import { INDOOR_RECORDS, OUTDOOR_RECORDS } from '../seedData'

// kW(소수 1자리) → W 정수. 왕복 시 Math.round(w/100)/10로 kW 복원(부동소수 오차 방지).
const kwToW = (kw: number): number => Math.round(kw * 1000)

// 분류 코드 상수
const CAT = { INDOOR: 1, OUTDOOR: 2 } as const
// 중분류(=시리즈) id: 실내기 4WAY/덕트, 실외기 절환형/냉방전용/GHP
const SUB = { IN_4WAY: 1, IN_DUCT: 2, OUT_HR: 3, OUT_COOL: 4, OUT_GHP: 5 } as const

const indoorSub = (type: string): number => (type === '덕트' ? SUB.IN_DUCT : SUB.IN_4WAY)
const outdoorSub = (cat: string): number => (cat === 'GHP' ? SUB.OUT_GHP : cat === '냉방전용' ? SUB.OUT_COOL : SUB.OUT_HR)

export function seedDatabase(db: Database): void {
  // ── 룩업/분류 ──
  db.run(`INSERT INTO product_categories (id, code, name_ko, sort_order) VALUES (?,?,?,?),(?,?,?,?)`, [
    CAT.INDOOR, 'INDOOR', '실내기', 10,
    CAT.OUTDOOR, 'OUTDOOR', '실외기', 20,
  ])
  db.run(
    `INSERT INTO product_subcategories (id, category_id, code, name_ko, energy_source) VALUES (?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?)`,
    [
      SUB.IN_4WAY, CAT.INDOOR, 'IN_4WAY', '4WAY 카세트', 'EHP',
      SUB.IN_DUCT, CAT.INDOOR, 'IN_DUCT', '덕트', 'EHP',
      SUB.OUT_HR, CAT.OUTDOOR, 'OUT_HR', '냉난방 절환형', 'EHP',
      SUB.OUT_COOL, CAT.OUTDOOR, 'OUT_COOL', '냉방전용', 'EHP',
      SUB.OUT_GHP, CAT.OUTDOOR, 'OUT_GHP', 'GHP', 'GHP',
    ],
  )
  // 시리즈: 중분류 1:1 (POC). id = 중분류 id.
  db.run(
    `INSERT INTO product_series (id, subcategory_id, code, name_ko, mfl_code) VALUES (?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?),(?,?,?,?,?)`,
    [
      SUB.IN_4WAY, SUB.IN_4WAY, 'S_IN_4WAY', 'Multi V 실내기 4WAY', null,
      SUB.IN_DUCT, SUB.IN_DUCT, 'S_IN_DUCT', 'Multi V 실내기 덕트', null,
      SUB.OUT_HR, SUB.OUT_HR, 'S_OUT_HR', 'Multi V Super 절환형', null,
      SUB.OUT_COOL, SUB.OUT_COOL, 'S_OUT_COOL', 'Multi V Super 냉방전용', null,
      SUB.OUT_GHP, SUB.OUT_GHP, 'S_OUT_GHP', 'GHP Super', null,
    ],
  )
  for (let g = 1; g <= 5; g++) db.run(`INSERT INTO efficiency_grades (id, name) VALUES (?,?)`, [g, `${g}등급`])
  db.run(`INSERT INTO price_types (id, code, name_ko, priority) VALUES (?,?,?,?)`, [1, 'CONSUMER', '소비자가', 10])

  // ── 제품(모델) ──
  let pid = 0
  const insertProduct = `INSERT INTO products
    (id, series_id, model_code, equipment_code, name_display, horsepower,
     cooling_capacity_w, heating_capacity_w, heating_capacity_cold_w, cop_cooling, cop_heating,
     efficiency_grade_id, max_connections, status, published_at, discontinued_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  for (const r of INDOOR_RECORDS) {
    pid += 1
    db.run(insertProduct, [
      pid, indoorSub(r.type), r.model, r.code, null, null,
      r.coolW, r.heatW, null, null, null,
      null, null, r.status, null, null, null, null,
    ])
  }

  const insertPrice = `INSERT INTO product_prices
    (product_id, price_type_id, price_krw, price_with_vat_krw, effective_start_date, effective_end_date, source_reference, priority)
    VALUES (?,?,?,?,?,?,?,?)`

  for (const r of OUTDOOR_RECORDS) {
    pid += 1
    db.run(insertProduct, [
      pid, outdoorSub(r.cat), r.model, null, null, r.hp,
      kwToW(r.cool), r.heatKw === null ? null : kwToW(r.heatKw), null, r.copCooling, r.copHeating,
      r.efficiencyGradeId, r.maxConn, r.status, null, r.status === 'ARCHIVED' ? '2024-01-01' : null, null, null,
    ])
    db.run(insertPrice, [
      pid, 1, r.priceKrw, r.priceWithVatKrw, r.effectiveStartDate, null, '장비마스터(PUBLISHED, 목업)', r.priority,
    ])
  }
}

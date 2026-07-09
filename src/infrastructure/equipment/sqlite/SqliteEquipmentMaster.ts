// 장비마스터 SQLite 백엔드 (읽기 포트 EquipmentMaster 구현).
// sql.js 초기화는 비동기이므로, 부팅 시 1회 로드하여 PUBLISHED 스냅샷을 동기 배열로 materialize한다.
// (동기 포트 계약 유지 → 생성/검도 소비측 무영향.)
//
// 환경 의존(sql.js WASM 로딩·IndexedDB 영속)은 주입한다(initSql/store) → 인프라 모듈은 env-무관·테스트 가능.

import type { Database, SqlJsStatic } from 'sql.js'
import type { EquipmentMaster } from '../../../domain/equipment/EquipmentMaster'
import type { IndoorSpecFields, OutdoorSpecFields } from '../../../domain/equipment/MasterRecord'
import type { EnergySourceCode } from '../../../domain/shared/EnergySource'
import { SCHEMA_SQL } from './schema'
import { seedDatabase } from './seed'
import { queryRows, num, numOrNull } from './query'

// sql.js 초기화 함수(WASM 로딩 방식 주입: 브라우저=?url, 노드=fs wasmBinary).
export type SqlInit = () => Promise<SqlJsStatic>

// DB 바이트 영속 어댑터(브라우저=IndexedDB). 없으면 매 부팅 시 시드(비영속).
export interface BytesStore {
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
}

// W(정수) → kW(소수 1자리). 저장 왕복 부동소수 오차 방지.
const wToKw = (w: number): number => Math.round(w / 100) / 10

function readPublishedIndoor(db: Database): IndoorSpecFields[] {
  const rows = queryRows(
    db,
    `SELECT equipment_code, model_code, cooling_capacity_w, heating_capacity_w, subcategory_name, energy_source
     FROM v_published_products WHERE category_code = 'INDOOR' ORDER BY id`,
  )
  return rows.map((r) => ({
    code: String(r.equipment_code),
    model: String(r.model_code),
    coolW: num(r.cooling_capacity_w),
    heatW: num(r.heating_capacity_w),
    type: String(r.subcategory_name),
    energySource: r.energy_source as EnergySourceCode,
  }))
}

function readPublishedOutdoor(db: Database): OutdoorSpecFields[] {
  const rows = queryRows(
    db,
    `SELECT vp.model_code, vp.subcategory_name, vp.energy_source, vp.cooling_capacity_w, vp.heating_capacity_w,
            vp.horsepower, vp.max_connections, vp.efficiency_grade_id, vp.cop_cooling, vp.cop_heating,
            pp.price_krw, pt.code AS price_type_code, pp.price_with_vat_krw, pp.effective_start_date, pp.priority AS price_priority
     FROM v_published_products vp
     LEFT JOIN product_prices pp ON pp.product_id = vp.id AND pp.effective_end_date IS NULL
     LEFT JOIN price_types pt ON pp.price_type_id = pt.id
     WHERE vp.category_code = 'OUTDOOR' ORDER BY vp.id`,
  )
  // comboMin/Max는 P1에서 미저장(정책 UI = P2) → 키를 넣지 않아 기본(0.5~1.3) 적용. 인메모리 시드와 동치.
  return rows.map((r) => ({
    model: String(r.model_code),
    cat: String(r.subcategory_name),
    sys: r.energy_source as EnergySourceCode,
    cool: wToKw(num(r.cooling_capacity_w)),
    heatKw: r.heating_capacity_w == null ? null : wToKw(num(r.heating_capacity_w)),
    hp: num(r.horsepower),
    maxConn: num(r.max_connections),
    priceKrw: num(r.price_krw),
    priceTypeCode: String(r.price_type_code),
    priceWithVatKrw: numOrNull(r.price_with_vat_krw),
    effectiveStartDate: String(r.effective_start_date),
    priority: num(r.price_priority),
    efficiencyGradeId: numOrNull(r.efficiency_grade_id),
    copCooling: numOrNull(r.cop_cooling),
    copHeating: numOrNull(r.cop_heating),
  }))
}

// 신규 DB 생성 + 스키마 + 시드. (기존 바이트가 없을 때)
function buildFreshDatabase(SQL: SqlJsStatic): Database {
  const db = new SQL.Database()
  db.run(SCHEMA_SQL)
  seedDatabase(db)
  return db
}

// SQLite 백엔드 마스터 핸들 — 읽기 포트 + (P2용) db 접근.
export interface SqliteEquipmentMasterHandle extends EquipmentMaster {
  readonly db: Database
}

// 부팅 팩토리: WASM 로드 → (영속 바이트 복원 | 신규 시드) → PUBLISHED 스냅샷 materialize.
export async function createSqliteEquipmentMaster(deps: { initSql: SqlInit; store?: BytesStore }): Promise<SqliteEquipmentMasterHandle> {
  const SQL = await deps.initSql()
  let db: Database
  const saved = deps.store ? await deps.store.load() : null
  if (saved) {
    db = new SQL.Database(saved)
  } else {
    db = buildFreshDatabase(SQL)
    if (deps.store) await deps.store.save(db.export())
  }

  const indoor = Object.freeze(readPublishedIndoor(db))
  const outdoor = Object.freeze(readPublishedOutdoor(db))

  return {
    db,
    publishedIndoor: () => indoor,
    publishedOutdoor: () => outdoor,
  }
}

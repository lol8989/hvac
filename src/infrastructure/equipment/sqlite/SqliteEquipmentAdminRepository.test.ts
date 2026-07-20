// 관리 리포지토리는 게시 게이트와 무관하게 '전 상태' 제품을 노출해야 한다(관리자 목록).
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { SEED_COUNTS } from '../seed/seedMeta'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}
const makeAdmin = async () => new SqliteEquipmentAdminRepository((await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })).db)

describe('SqliteEquipmentAdminRepository (관리 조회 — 전 상태)', () => {
  it('LG 스펙시트 실데이터 전량(SEED_COUNTS.products)을 전 상태로 반환한다', async () => {
    const rows = (await makeAdmin()).listProducts()
    expect(rows).toHaveLength(SEED_COUNTS.products)
    const draft = rows.find((r) => r.modelCode === 'RNW9999DRAFT')
    const archived = rows.find((r) => r.modelCode === 'RPUW-ARCHIVED')
    expect(draft?.status).toBe('DRAFT')
    expect(archived?.status).toBe('ARCHIVED')
  })

  // 2026-07-20 정책: 게시 요건(Publishability)을 통과하면 전량 게시한다(이전엔 큐레이션 26종만).
  // DRAFT로 남는 것은 요건 미달분이다 — 실내기 용량 결측, 실외기 냉방용량 결측 등.
  it('상태 분포: 게시 요건 통과분은 게시, 미달분만 DRAFT다', async () => {
    const rows = (await makeAdmin()).listProducts()
    const count = (s: string) => rows.filter((r) => r.status === s).length
    expect(count('PUBLISHED')).toBe(1088)
    expect(count('ARCHIVED')).toBe(1)
    expect(count('DRAFT')).toBe(SEED_COUNTS.products - 1089)
  })

  it('스펙시트 실모델(칠러·CDU·환기)도 분류와 함께 조회된다', async () => {
    const rows = (await makeAdmin()).listProducts()
    // 게시 요건을 갖췄으므로 게시본이다. 비-VRF·환기는 게시돼도 생성단 조합 후보로 새지 않는다.
    expect(rows.find((r) => r.modelCode === 'ACAH020LET2')).toMatchObject({ categoryCode: 'OUTDOOR', energySource: 'Chiller', status: 'PUBLISHED' })
    expect(rows.find((r) => r.modelCode === 'Z-E0100R2AR')).toMatchObject({ categoryCode: 'VENT', energySource: 'ERV', status: 'PUBLISHED' })
    expect(rows.find((r) => r.modelCode === 'RPUW281X9P')).toMatchObject({ horsepower: 28, coolingW: 78400, status: 'PUBLISHED' })
  })

  it('실외기 행에 분류·계열·HP·용량이 채워진다', async () => {
    const rows = (await makeAdmin()).listProducts()
    const g = rows.find((r) => r.modelCode === 'RPUW12BX9M')!
    expect(g).toMatchObject({
      categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형',
      energySource: 'EHP', horsepower: 12, coolingW: 34800, heatingW: 39200, status: 'PUBLISHED',
    })
  })

  it('큐레이션 게시본 실내기는 장비번호(equipmentCode)를 갖고, 스펙시트 모델은 갖지 않는다', async () => {
    const rows = (await makeAdmin()).listProducts()
    const idu = rows.find((r) => r.modelCode === 'RNW0401C2S')!
    expect(idu).toMatchObject({ categoryCode: 'INDOOR', subcategoryName: '1WAY 카세트'})
  })
})

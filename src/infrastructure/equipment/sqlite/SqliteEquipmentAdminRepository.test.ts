// 관리 리포지토리는 게시 게이트와 무관하게 '전 상태' 제품을 노출해야 한다(관리자 목록).
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}
const makeAdmin = async () => new SqliteEquipmentAdminRepository((await createSqliteEquipmentMaster({ initSql: nodeInit })).db)

describe('SqliteEquipmentAdminRepository (관리 조회 — 전 상태)', () => {
  it('DRAFT/PUBLISHED/ARCHIVED를 모두 포함해 25제품(실내기17+실외기8)을 반환한다', async () => {
    const rows = (await makeAdmin()).listProducts()
    expect(rows).toHaveLength(25) // 16 게시 실내기 + DRAFT99 + 7 게시 실외기 + ARCHIVED
    const draft = rows.find((r) => r.modelCode === 'RNW9999DRAFT')
    const archived = rows.find((r) => r.modelCode === 'RPUW-ARCHIVED')
    expect(draft?.status).toBe('DRAFT')
    expect(archived?.status).toBe('ARCHIVED')
  })

  it('상태 분포: PUBLISHED 23 · DRAFT 1 · ARCHIVED 1', async () => {
    const rows = (await makeAdmin()).listProducts()
    const count = (s: string) => rows.filter((r) => r.status === s).length
    expect(count('PUBLISHED')).toBe(23)
    expect(count('DRAFT')).toBe(1)
    expect(count('ARCHIVED')).toBe(1)
  })

  it('실외기 행에 분류·계열·HP·용량이 채워진다', async () => {
    const rows = (await makeAdmin()).listProducts()
    const g = rows.find((r) => r.modelCode === 'RPUW12BX9M')!
    expect(g).toMatchObject({
      categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형',
      energySource: 'EHP', horsepower: 12, coolingW: 34800, heatingW: 39000, status: 'PUBLISHED',
    })
  })

  it('실내기 행은 장비번호(equipmentCode)가 있다', async () => {
    const rows = (await makeAdmin()).listProducts()
    const idu = rows.find((r) => r.modelCode === 'RNW0401C2S')!
    expect(idu).toMatchObject({ categoryCode: 'INDOOR', subcategoryName: '4WAY 카세트', equipmentCode: '40C' })
  })
})

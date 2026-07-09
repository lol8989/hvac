// SQLite 백엔드 마스터가 인메모리 마스터와 "동치"임을 고정한다(생성/검도 소비측 무영향의 핵심 보장).
// + 게시 게이트, 영속(export/import) 왕복. sql.js WASM은 노드(fs wasmBinary)로 로드.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSqliteEquipmentMaster, type BytesStore } from './SqliteEquipmentMaster'
import { InMemoryEquipmentMaster } from '../InMemoryEquipmentMaster'
import type { IndoorSpecFields, OutdoorSpecFields } from '../../../domain/equipment/MasterRecord'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}
const byModelI = (xs: readonly IndoorSpecFields[]) => [...xs].sort((a, b) => a.model.localeCompare(b.model))
const byModelO = (xs: readonly OutdoorSpecFields[]) => [...xs].sort((a, b) => a.model.localeCompare(b.model))

describe('SqliteEquipmentMaster (SQLite 백엔드)', () => {
  it('publishedIndoor/Outdoor가 인메모리 마스터와 동치이다(생성단 무영향)', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit })
    const mem = new InMemoryEquipmentMaster()
    expect(byModelI(sq.publishedIndoor())).toEqual(byModelI(mem.publishedIndoor()))
    expect(byModelO(sq.publishedOutdoor())).toEqual(byModelO(mem.publishedOutdoor()))
  })

  it('반환 순서까지 InMemory와 동일하다(list()/UI 표시 순서 회귀 고정)', async () => {
    // 소비측(카탈로그 list())이 순서를 그대로 노출하므로, 정렬 없이 순서까지 고정한다.
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit })
    const mem = new InMemoryEquipmentMaster()
    expect(sq.publishedIndoor()).toEqual(mem.publishedIndoor())
    expect(sq.publishedOutdoor()).toEqual(mem.publishedOutdoor())
  })

  it('[게이트] 게시된 실내기 16·실외기 7만 노출(DRAFT/ARCHIVED 제외)', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit })
    expect(sq.publishedIndoor()).toHaveLength(16)
    expect(sq.publishedOutdoor()).toHaveLength(7)
    expect(sq.publishedIndoor().some((m) => m.code === 'DRAFT99')).toBe(false)
    expect(sq.publishedOutdoor().some((m) => m.model === 'RPUW-ARCHIVED')).toBe(false)
  })

  it('실외기 스펙 왕복 정확성(kW·단가·등급·COP·최대연결)', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit })
    const g = sq.publishedOutdoor().find((m) => m.model === 'RPUW12BX9M')!
    expect(g).toMatchObject({ cat: '냉난방 절환형', sys: 'EHP', cool: 34.8, heatKw: 39.2, hp: 12, maxConn: 20, priceKrw: 4120000, priceTypeCode: 'CONSUMER', efficiencyGradeId: 3, copCooling: 4.99 })
    const coolOnly = sq.publishedOutdoor().find((m) => m.model === 'RPUQ141X9S')!
    expect(coolOnly.heatKw).toBeNull()
    expect(coolOnly.efficiencyGradeId).toBeNull()
    expect(coolOnly.priceWithVatKrw).toBeNull()
  })

  it('[영속] store가 있으면 시드 DB를 저장하고, 재부팅 시 복원해 동일 데이터를 낸다', async () => {
    let bytes: Uint8Array | null = null
    const store: BytesStore = { load: async () => bytes, save: async (b) => { bytes = b } }
    const first = await createSqliteEquipmentMaster({ initSql: nodeInit, store })
    expect(bytes).not.toBeNull() // 신규 시드가 저장됨
    const second = await createSqliteEquipmentMaster({ initSql: nodeInit, store }) // saved 복원 경로
    expect(byModelO(second.publishedOutdoor())).toEqual(byModelO(first.publishedOutdoor()))
    expect(byModelI(second.publishedIndoor())).toEqual(byModelI(first.publishedIndoor()))
  })
})

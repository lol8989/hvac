// SQLite 백엔드 마스터가 인메모리 마스터와 "동치"임을 고정한다(생성/검도 소비측 무영향의 핵심 보장).
// + 게시 게이트, 영속(export/import) 왕복. sql.js WASM은 노드(fs wasmBinary)로 로드.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
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
  // 2026-07-20 정책 변경: 게시 요건(Publishability)을 통과하면 전량 게시한다.
  // 그래서 SQLite(실 장비마스터)와 InMemory(큐레이션 목업 폴백)는 더 이상 '동치'가 아니다.
  // 남는 보장은 **포함 관계**다 — 폴백에서 실DB로 바꿔도 기존 큐레이션 모델이 사라지면 안 된다.
  it('SQLite는 인메모리 큐레이션을 모두 포함한다(폴백 → 실DB 전환 시 유실 없음)', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
    const mem = new InMemoryEquipmentMaster()

    const sqIndoor = new Set(sq.publishedIndoor().map((m) => m.model))
    const sqOutdoor = new Set(sq.publishedOutdoor().map((m) => m.model))
    for (const m of mem.publishedIndoor()) expect(sqIndoor.has(m.model)).toBe(true)
    for (const m of mem.publishedOutdoor()) expect(sqOutdoor.has(m.model)).toBe(true)
  })

  it('반환 순서가 결정적이다(list()/UI 표시 순서 회귀 고정)', async () => {
    // 소비측(카탈로그 list())이 순서를 그대로 노출한다. 백엔드가 달라졌으므로 InMemory와의
    // 순서 일치는 더 이상 성립하지 않지만, 같은 시드를 두 번 열면 같은 순서여야 한다.
    const a = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
    const b = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
    expect(a.publishedIndoor().map((m) => m.model)).toEqual(b.publishedIndoor().map((m) => m.model))
    expect(a.publishedOutdoor().map((m) => m.model)).toEqual(b.publishedOutdoor().map((m) => m.model))
  })

  it('[게이트] 요건 통과분만 노출한다 — DRAFT/ARCHIVED 제외, 비-VRF 실외기 제외', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })

    // 큐레이션 목업(19·7) 수준이 아니라 실 장비마스터 규모로 노출된다.
    expect(sq.publishedIndoor()).toHaveLength(234)
    expect(sq.publishedOutdoor()).toHaveLength(697)

    expect(sq.publishedIndoor().some((m) => m.model === 'DRAFT99')).toBe(false)
    expect(sq.publishedOutdoor().some((m) => m.model === 'RPUW-ARCHIVED')).toBe(false)
    // 비-VRF(칠러·CDU·단품)는 게시돼도 조합 후보로 새지 않는다 — SqliteEquipmentMaster.vrf.test.ts
    expect(sq.publishedOutdoor().some((m) => m.model === 'ACAH020LET2')).toBe(false)
  })

  it('실외기 스펙 왕복 정확성(kW·단가·등급·COP·최대연결)', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
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
    const first = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed, store })
    expect(bytes).not.toBeNull() // 신규 시드가 저장됨
    const second = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed, store }) // saved 복원 경로
    expect(byModelO(second.publishedOutdoor())).toEqual(byModelO(first.publishedOutdoor()))
    expect(byModelI(second.publishedIndoor())).toEqual(byModelI(first.publishedIndoor()))
  })
})

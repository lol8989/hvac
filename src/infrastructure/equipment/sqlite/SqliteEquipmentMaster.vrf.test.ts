// 생성·검도가 소비하는 실외기는 VRF만이다 (주인님 확정 2026-07-10).
//
// 칠러·CDU·시스템 에어컨 단품은 실내기를 조합하지 않는다. HP 백필로 게시 가능해졌지만
// (Publishability의 계열별 요건 분리) 생성단 조합 후보로 새어 나가면 안 된다.
// OutdoorSpecFields.maxConn은 number 계약이라, max_connections가 없는 이들이 흘러들면 NaN이 된다.
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md §5
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster, type BytesStore } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

describe('publishedOutdoor — 비-VRF 격리', () => {
  it('게시된 칠러는 생성단 실외기 목록에 나타나지 않는다', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
    const repo = new SqliteEquipmentAdminRepository(sq.db)

    const chiller = repo.listProducts().find((r) => r.modelCode === 'ACAH020LET2')!
    expect(chiller.hpSource).toBe('DERIVED') // 냉방용량 환산 백필
    expect(chiller.maxConnections).toBeNull()

    // 게시 요건을 갖췄으므로 시드가 이미 게시한다(2026-07-20 정책: 요건 통과분 전량 게시).
    // 비-VRF는 최대 연결 수가 없어도 게시된다 — 그래서 격리가 더 중요해졌다.
    expect(chiller.status).toBe('PUBLISHED')

    // 그러나 생성단 스냅샷을 다시 뜨면 조합 후보에 없다.
    const bytes = sq.db.export()
    const store: BytesStore = { load: () => Promise.resolve(bytes), save: () => Promise.resolve() }
    const reboot = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed, store })
    expect(reboot.publishedOutdoor().find((m) => m.model === 'ACAH020LET2')).toBeUndefined()
  })

  it('생성단 실외기는 전부 최대 연결 실내기 수를 가진다 (NaN 유입 차단)', async () => {
    const sq = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
    for (const m of sq.publishedOutdoor()) {
      expect(Number.isInteger(m.maxConn)).toBe(true)
      expect(m.maxConn).toBeGreaterThan(0)
      expect(m.hp).toBeGreaterThan(0)
    }
  })
})

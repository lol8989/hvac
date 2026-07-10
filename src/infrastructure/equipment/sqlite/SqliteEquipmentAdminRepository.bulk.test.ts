// 일괄 게시(setStatusMany): 전이 불가·게시 전제조건 미달 행은 사유와 함께 스킵하고 나머지만 적용한다.
// 게시 게이트가 실데이터(칠러·CDU·ERV·장비번호 없는 실내기)를 생성단으로 흘려보내지 않는지 고정한다.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'
import { queryRows } from './query'
import type { EquipmentDomainError } from '../../../domain/equipment/errors'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

async function makeRepo(onChange?: () => void) {
  const { db } = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
  return { repo: new SqliteEquipmentAdminRepository(db, { onChange, now: () => '2026-07-09T00:00:00.000Z' }), db }
}

const idOf = (repo: SqliteEquipmentAdminRepository, model: string) =>
  repo.listProducts().find((r) => r.modelCode === model)!.id
const statusOf = (repo: SqliteEquipmentAdminRepository, model: string) =>
  repo.listProducts().find((r) => r.modelCode === model)!.status

describe('setStatusMany (일괄 전이)', () => {
  it('DRAFT 여러 건을 한 번에 게시한다', async () => {
    const { repo } = await makeRepo()
    const models = ['RPUW281X9P', 'RPUW301X9P', 'RPUW321X9P']
    const res = repo.setStatusMany(models.map((m) => idOf(repo, m)), 'PUBLISHED')

    expect(res).toMatchObject({ applied: 3 })
    expect(res.skipped).toHaveLength(0)
    for (const m of models) expect(statusOf(repo, m)).toBe('PUBLISHED')
  })

  it('이미 게시된 행은 전이 불가로 스킵하고 나머지만 적용한다', async () => {
    const { repo } = await makeRepo()
    const already = idOf(repo, 'RPUW12BX9M') // 큐레이션 게시본
    const fresh = idOf(repo, 'RPUW281X9P')

    const res = repo.setStatusMany([already, fresh], 'PUBLISHED')
    expect(res.applied).toBe(1)
    expect(res.skipped).toHaveLength(1)
    expect(res.skipped[0]).toMatchObject({ id: already, modelCode: 'RPUW12BX9M' })
    expect(res.skipped[0].reason).toContain('전이는 허용되지 않습니다')
    expect(statusOf(repo, 'RPUW281X9P')).toBe('PUBLISHED')
  })

  // 2026-07-10: 칠러는 냉방용량 환산으로 HP가 백필되고(22HP, DERIVED), 비-VRF라 최대 연결 실내기 수를
  // 요구하지 않으므로 게시된다. 대신 생성단 조합 후보에서 제외된다(SqliteEquipmentMaster.publishedOutdoor).
  it('비-VRF 실외기(공랭식 칠러)는 최대 연결 실내기 수 없이도 게시된다', async () => {
    const { repo } = await makeRepo()
    const res = repo.setStatusMany([idOf(repo, 'ACAH020LET2')], 'PUBLISHED')
    expect(res.applied).toBe(1)
    expect(statusOf(repo, 'ACAH020LET2')).toBe('PUBLISHED')
  })

  it('냉방 용량이 없어 HP를 환산할 수 없는 실외기는 스킵된다', async () => {
    const { repo } = await makeRepo()
    const res = repo.setStatusMany([idOf(repo, 'HBW0900A2A')], 'PUBLISHED')
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toContain('냉방 용량')
    expect(statusOf(repo, 'HBW0900A2A')).toBe('DRAFT')
  })

  it('냉난방 용량이 없는 환기(ERV)는 게시된다(생성·검도 미소비)', async () => {
    const { repo } = await makeRepo()
    const res = repo.setStatusMany([idOf(repo, 'Z-E0100R2AR')], 'PUBLISHED')
    expect(res.applied).toBe(1)
  })

  it('용량이 없는 실내기는 스킵된다', async () => {
    const { repo } = await makeRepo()
    const noCap = repo.listProducts().find((r) => r.categoryCode === 'INDOOR' && r.coolingW === null)!
    const res = repo.setStatusMany([noCap.id], 'PUBLISHED')
    expect(res.applied).toBe(0)
    expect(res.skipped[0].reason).toContain('냉방 용량')
  })

  it('존재하지 않는 id는 사유와 함께 스킵된다', async () => {
    const { repo } = await makeRepo()
    const res = repo.setStatusMany([999999], 'PUBLISHED')
    expect(res).toMatchObject({ applied: 0 })
    expect(res.skipped[0].reason).toContain('존재하지 않는')
  })

  it('빈 목록은 아무 일도 하지 않고 영속 훅도 부르지 않는다', async () => {
    let calls = 0
    const { repo } = await makeRepo(() => calls++)
    expect(repo.setStatusMany([], 'PUBLISHED')).toEqual({ applied: 0, skipped: [] })
    expect(calls).toBe(0)
  })

  it('적용분이 0이면 영속 훅을 부르지 않는다(스킵만 있는 경우)', async () => {
    let calls = 0
    const { repo } = await makeRepo(() => calls++)
    repo.setStatusMany([idOf(repo, 'HBW0900A2A')], 'PUBLISHED') // 용량 없어 게시 불가
    expect(calls).toBe(0)
  })

  it('적용분이 있으면 영속 훅을 1회만 부른다(수백 건도 한 트랜잭션)', async () => {
    let calls = 0
    const { repo } = await makeRepo(() => calls++)
    const ids = repo.listProducts().filter((r) => r.status === 'DRAFT' && r.categoryCode === 'OUTDOOR' && r.horsepower).slice(0, 50).map((r) => r.id)
    const res = repo.setStatusMany(ids, 'PUBLISHED')
    expect(res.applied).toBe(50)
    expect(calls).toBe(1)
  })

  it('게시한 행은 게시 뷰(v_published_products)에 즉시 나타난다', async () => {
    const { repo, db } = await makeRepo()
    const id = idOf(repo, 'RPUW281X9P')
    repo.setStatusMany([id], 'PUBLISHED')
    expect(queryRows(db, `SELECT id FROM v_published_products WHERE id = ${id}`)).toHaveLength(1)
  })

  it('일괄 보관(ARCHIVED)도 동작하고 게시 뷰에서 빠진다', async () => {
    const { repo, db } = await makeRepo()
    const id = idOf(repo, 'RPUW12BX9M')
    expect(repo.setStatusMany([id], 'ARCHIVED').applied).toBe(1)
    expect(queryRows(db, `SELECT id FROM v_published_products WHERE id = ${id}`)).toHaveLength(0)
  })
})

describe('setStatus (단건) — 게시 전제조건', () => {
  it('냉방 용량이 없는 실외기 게시는 도메인 예외로 거부한다', async () => {
    const { repo } = await makeRepo()
    try {
      repo.setStatus(idOf(repo, 'HBW0900A2A'), 'PUBLISHED')
      throw new Error('예외가 발생하지 않았다')
    } catch (e) {
      expect((e as EquipmentDomainError).code).toBe('INVALID_FIELD')
      expect((e as Error).message).toContain('냉방 용량')
    }
    expect(statusOf(repo, 'ACAH020LET2')).toBe('DRAFT')
  })

  it('요건을 갖춘 실외기는 단건 게시된다', async () => {
    const { repo } = await makeRepo()
    repo.setStatus(idOf(repo, 'RPUW281X9P'), 'PUBLISHED')
    expect(statusOf(repo, 'RPUW281X9P')).toBe('PUBLISHED')
  })
})

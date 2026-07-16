// 실내기↔실외기 호환 기준표 저장소 — 현업 확정 시드 + 관리자 편집 override.
// 기본값은 시드(compatMatrixSeed), series_compat 테이블엔 '바꾼 칸만' 남는다.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'
import { queryRows } from './query'
import type { EquipmentDomainError } from '../../../domain/equipment/errors'
import type { CompatValue } from '../../../domain/equipment/CompatMatrix'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

async function makeRepo(onChange?: () => void) {
  const handle = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
  return { repo: new SqliteEquipmentAdminRepository(handle.db, { onChange }), db: handle.db }
}

const GHP = { subcategory: 'GHP', series: 'GHP Super III' }
const CASSETTE = { subcategory: '4WAY 카세트', series: 'Multi V 실내기(민수전용)' }
const BIG_DUCT = { subcategory: '덕트(대공간)', series: 'Multi V 실내기(대공간덕트)' }

describe('getCompatMatrix', () => {
  it('시드 직후엔 현업 확정 조합표 그대로다 (GHP는 대공간덕트만 O)', async () => {
    const { repo } = await makeRepo()
    const m = repo.getCompatMatrix()
    expect(m.outdoorRows).toHaveLength(35)
    expect(m.indoorColumns).toHaveLength(39)
    expect(m.isCompatible(GHP, BIG_DUCT)).toBe(true)
    expect(m.isCompatible(GHP, CASSETTE)).toBe(false)
  })
})

describe('setCompatCell', () => {
  it('한 칸을 바꾸면 다시 읽을 때 반영되고 다른 칸은 그대로다', async () => {
    const changes: number[] = []
    const { repo } = await makeRepo(() => changes.push(1))
    repo.setCompatCell(GHP, CASSETTE, 'O')
    const m = repo.getCompatMatrix()
    expect(m.isCompatible(GHP, CASSETTE)).toBe(true) // 바뀐 칸
    expect(m.isCompatible(GHP, BIG_DUCT)).toBe(true) // 그대로
    expect(changes.length).toBe(1) // 쓰기 후 영속 훅 호출
  })

  it('되돌리면(원래 값으로) 원상복구된다', async () => {
    const { repo } = await makeRepo()
    repo.setCompatCell(GHP, CASSETTE, 'O')
    repo.setCompatCell(GHP, CASSETTE, 'X')
    expect(repo.getCompatMatrix().isCompatible(GHP, CASSETTE)).toBe(false)
  })

  const countRows = (db: import('sql.js').Database) => Number(queryRows(db, `SELECT COUNT(*) AS n FROM series_compat`)[0].n)

  it("시드와 같은 값으로 되돌리면 override 행을 걷어낸다 ('빈 테이블=시드 그대로' 불변식)", async () => {
    const { repo, db } = await makeRepo()
    repo.setCompatCell(GHP, CASSETTE, 'O') // 시드는 X → override 생김
    expect(countRows(db)).toBe(1)
    repo.setCompatCell(GHP, CASSETTE, 'X') // 시드값 X로 되돌림 → 행 제거
    expect(countRows(db)).toBe(0)
  })

  it('잘못된 value는 저장소 경계에서 INVALID_FIELD로 거부한다', async () => {
    const { repo } = await makeRepo()
    expect(() => repo.setCompatCell(GHP, CASSETTE, 'Z' as CompatValue)).toThrow(
      expect.objectContaining({ code: 'INVALID_FIELD' } as Partial<EquipmentDomainError>),
    )
  })

  it('알 수 없는 축이면 INVALID_FIELD로 거부한다', async () => {
    const { repo } = await makeRepo()
    expect(() => repo.setCompatCell({ subcategory: '없음', series: '없음' }, CASSETTE, 'O')).toThrow(
      expect.objectContaining({ code: 'INVALID_FIELD' } as Partial<EquipmentDomainError>),
    )
  })
})

describe('clearCompatForOutdoor', () => {
  it('한 실외기 시리즈의 편집을 모두 걷어내 시드로 되돌린다', async () => {
    const { repo, db } = await makeRepo()
    repo.setCompatCell(GHP, CASSETTE, 'O')
    repo.setCompatCell(GHP, BIG_DUCT, 'X') // 시드 O → override
    expect(Number(queryRows(db, `SELECT COUNT(*) AS n FROM series_compat`)[0].n)).toBe(2)
    repo.clearCompatForOutdoor(GHP)
    expect(Number(queryRows(db, `SELECT COUNT(*) AS n FROM series_compat`)[0].n)).toBe(0)
    const m = repo.getCompatMatrix()
    expect(m.isCompatible(GHP, BIG_DUCT)).toBe(true) // 시드 복원
    expect(m.isCompatible(GHP, CASSETTE)).toBe(false)
  })
})

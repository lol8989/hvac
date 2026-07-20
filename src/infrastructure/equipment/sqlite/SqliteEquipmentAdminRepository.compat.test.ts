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
import { seedValueAt } from '../seed/compatMatrixFromSeed'
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
  // 축은 게시 카탈로그(product_series)에서 파생된다 — 개수를 고정하면 카탈로그에
  // 시리즈가 하나 늘 때마다 깨진다. 개수 대신 '의미'를 단언한다.
  it('현업 확정 조합표의 판정을 따른다 (GHP는 대공간덕트만 O)', async () => {
    const { repo } = await makeRepo()
    const m = repo.getCompatMatrix()
    expect(m.isCompatible(GHP, BIG_DUCT)).toBe(true)
    expect(m.isCompatible(GHP, CASSETTE)).toBe(false)
  })

  it('축은 카탈로그에서 온다 — 알려진 시리즈가 행·열에 있다', async () => {
    const { repo } = await makeRepo()
    const m = repo.getCompatMatrix()
    const has = (axes: readonly { subcategory: string; series: string }[], a: { subcategory: string; series: string }) =>
      axes.some((x) => x.subcategory === a.subcategory && x.series === a.series)

    expect(has(m.outdoorRows, GHP)).toBe(true)
    expect(has(m.indoorColumns, BIG_DUCT)).toBe(true)
    // 수냉·칠러 계열은 Multi V 실내기와 붙지 않는다(현업 확정 격자의 수렴점)
    expect(m.isCompatible({ subcategory: '수냉식', series: 'Multi V Water 5' }, BIG_DUCT)).toBe(false)
  })

  it('카탈로그에 새 실외기 시리즈가 생기면 조합관리에 자동으로 행이 나타난다 (기본 X)', async () => {
    const { repo, db } = await makeRepo()
    const before = repo.getCompatMatrix().outdoorRows.length

    // 기존 OUTDOOR 중분류 하나를 골라 그 아래 새 시리즈를 넣는다.
    const sub = queryRows(
      db,
      `SELECT sc.id AS id FROM product_subcategories sc
         JOIN product_categories c ON sc.category_id = c.id
        WHERE c.code = 'OUTDOOR' LIMIT 1`,
    )[0]
    db.run(`INSERT INTO product_series (subcategory_id, code, name_ko, energy_source) VALUES (?, ?, ?, ?)`, [
      Number(sub.id),
      'TEST_NEW_SERIES',
      '테스트 신규 시리즈',
      'EHP',
    ])

    const after = repo.getCompatMatrix()
    expect(after.outdoorRows.length).toBe(before + 1)
    const added = after.outdoorRows.find((r) => r.series === '테스트 신규 시리즈')
    expect(added).toBeDefined()
    // 시드에 없는 새 쌍은 기본 불가 — 관리자가 켠다.
    expect(after.isCompatible(added!, BIG_DUCT)).toBe(false)
  })
})

// ⚠️ 알려진 결함(2026-07-20) — 카탈로그 축의 일부가 현업 시드와 (중분류) 이름이 달라
// 시드값을 못 받고 기본 'X'로 떨어진다. 카탈로그 1368칸 중 318칸(23%).
// 원인은 시리즈명이 아니라 **중분류 명칭 체계**가 시드(현업 표기)와 카탈로그(우리 분류)에서
// 다른 것이다 — cleanSeedLabel은 시리즈명 주석만 뗀다.
// 해소하려면 중분류 매핑을 현업이 확정해야 한다(1:N·N:1·충돌 존재).
//   근거·결정 목록: doc/05_설계결정/실내외기_조합_확인표_현업회신_반영_2026-07-16.md §5
// 이 테스트는 '더 나빠지지 않게' 막는 래칫이다. 매핑이 확정되면 목록이 줄고 이 테스트가 깨진다 —
// 그때 목록을 줄이는 것이 정상 경로다.
describe('현업 시드 커버리지 (알려진 결함 래칫)', () => {
  const ORPHAN_INDOOR_COLUMNS = [
    '기타 실내기 | AWHP 싱글 시스템보일러',
    '2WAY 카세트 | Multi V 실내기(민수전용)',
    '4WAY 카세트(듀얼베인) | Multi V S(주거)',
    '기타 실내기 | Multi V S(주거)',
    '기타 실내기 | Multi V 실내기(시스템보일러)',
    '기타 실내기 | SINGLE / Universal',
    '기타 실내기 | Smart Multi V S(주거_냉방전용)',
    '벽걸이형 | Multi V S(주거)',
  ]

  it('시드 근거를 전혀 못 받는 실내기 열은 알려진 목록 그대로다', async () => {
    const { repo } = await makeRepo()
    const m = repo.getCompatMatrix()
    const orphans = m.indoorColumns
      .filter((col) => m.outdoorRows.every((row) => seedValueAt(row, col) == null))
      .map((col) => `${col.subcategory} | ${col.series}`)

    expect(orphans.sort()).toEqual([...ORPHAN_INDOOR_COLUMNS].sort())
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

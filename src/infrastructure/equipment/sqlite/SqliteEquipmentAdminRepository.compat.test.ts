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

// 현업 시드 커버리지 — 중분류 명칭 체계가 시드(현업 표기)와 카탈로그(우리 분류)에서 다르다.
// seedValueAt이 시리즈명으로 되짚어(후보 유일 또는 값 만장일치일 때만) 현업 판정을 살린다.
// 이 테스트는 래칫이다 — 커버리지가 나빠지면 즉시 깨진다.
//   근거·남은 결정: doc/05_설계결정/실내외기_조합_확인표_현업회신_반영_2026-07-16.md §6
describe('현업 시드 커버리지 (래칫)', () => {
  const orphanCols = (m: ReturnType<SqliteEquipmentAdminRepository['getCompatMatrix']>) =>
    m.indoorColumns
      .filter((col) => m.outdoorRows.every((row) => seedValueAt(row, col) == null))
      .map((col) => `${col.subcategory} | ${col.series}`)

  it('현업 근거를 전혀 못 받는 실내기 열은 없다', async () => {
    const { repo } = await makeRepo()
    expect(orphanCols(repo.getCompatMatrix())).toEqual([])
  })

  // 남은 미근거 칸은 전부 한 행에 몰려 있다.
  // 카탈로그는 'Multi V 실외기(큐레이션)'을 절환형·냉방전용·GHP 세 중분류에 두는데 현업 시드엔
  // 절환형·GHP 둘뿐이다. 두 후보의 값이 갈리는 열에서는 만장일치가 아니라 자동 채택할 수 없다 —
  // 임의로 고르면 현업 판정을 날조하는 것이다. 현업 확인 대기(문서 §6).
  it('근거 못 받는 칸은 큐레이션 냉방전용 행에만 남는다', async () => {
    const { repo } = await makeRepo()
    const m = repo.getCompatMatrix()
    const ungroundedRows = new Set<string>()
    for (const row of m.outdoorRows) {
      for (const col of m.indoorColumns) {
        if (seedValueAt(row, col) == null) ungroundedRows.add(`${row.subcategory} | ${row.series}`)
      }
    }
    expect([...ungroundedRows]).toEqual(['냉방전용 | Multi V 실외기(큐레이션)'])
  })

  it('중분류 이름이 달라도 시리즈가 같으면 현업 판정을 받는다', async () => {
    const { repo } = await makeRepo()
    const m = repo.getCompatMatrix()
    // 카탈로그 '기타 실내기 | Multi V 실내기(시스템보일러)' ← 현업 '시스템보일러 | 〃'
    const boiler = { subcategory: '기타 실내기', series: 'Multi V 실내기(시스템보일러)' }
    expect(seedValueAt({ subcategory: '냉난방 절환형', series: 'Multi V S' }, boiler)).not.toBeNull()
    expect(m.indoorColumns.some((c) => c.subcategory === boiler.subcategory && c.series === boiler.series)).toBe(true)
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

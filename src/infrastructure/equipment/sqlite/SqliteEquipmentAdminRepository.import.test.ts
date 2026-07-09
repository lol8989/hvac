// 스펙시트 업로드 일괄 적재(P3): 파서 → 검증 분류 → DRAFT 적재 + product_specs(JSONB).
// 실제 LG 시트(Multi V Super 5 ODU)로 등록 → 게시까지의 경로를 종단 고정한다.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import readXlsxFile from 'read-excel-file/node'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'
import { queryRows } from './query'
import { toParsedSheets, type SheetRow } from '../spec/specSheetRows'
import { classifyImport, type ImportRow, type ParsedProduct } from '../../../domain/equipment/SpecImport'
import type { EquipmentDomainError } from '../../../domain/equipment/errors'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

async function makeRepo(onChange?: () => void) {
  const { db } = await createSqliteEquipmentMaster({ initSql: nodeInit })
  return { repo: new SqliteEquipmentAdminRepository(db, { onChange, now: () => '2026-07-09T00:00:00.000Z' }), db }
}

const readFixture = async (name: string) =>
  (await readXlsxFile(resolve('src/test/fixtures', name))) as unknown as { sheet: string; data: SheetRow[] }[]

const parsedFrom = async (name: string): Promise<ParsedProduct[]> =>
  toParsedSheets(await readFixture(name)).flatMap((s) => s.products)

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  product: { modelCode: 'ZZZ011X', coolingW: 10000, heatingW: 11000, maxConnections: 5, specData: { '냉매 > 종류': { value: 'R410A', unit: null } } },
  horsepower: 1,
  verdict: 'OK',
  ...over,
})

describe('importProducts (스펙시트 일괄 등록)', () => {
  it('OK 행만 DRAFT로 적재하고 오류·중복 행은 건너뛴다', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length

    const inserted = repo.importProducts('S_OUT_HR', [
      row(),
      row({ product: { ...row().product, modelCode: 'ERR001' }, verdict: 'ERROR', reason: '용량 없음' }),
      row({ product: { ...row().product, modelCode: 'DUP001' }, verdict: 'DUPLICATE', reason: '중복' }),
    ])

    expect(inserted).toBe(1)
    expect(repo.listProducts()).toHaveLength(before + 1)
    const added = repo.listProducts().find((r) => r.modelCode === 'ZZZ011X')!
    expect(added).toMatchObject({ status: 'DRAFT', categoryCode: 'OUTDOOR', horsepower: 1, coolingW: 10000, maxConnections: 5 })
    expect(repo.listProducts().some((r) => r.modelCode === 'ERR001' || r.modelCode === 'DUP001')).toBe(false)
  })

  it('롱테일 스펙을 product_specs에 JSON으로 저장한다', async () => {
    const { repo, db } = await makeRepo()
    repo.importProducts('S_OUT_HR', [row()])
    const id = repo.listProducts().find((r) => r.modelCode === 'ZZZ011X')!.id
    const spec = queryRows(db, `SELECT spec_data FROM product_specs WHERE product_id = ${id}`)[0]
    expect(JSON.parse(String(spec.spec_data))['냉매 > 종류']).toEqual({ value: 'R410A', unit: null })
  })

  it('업로드 직후에는 게시 뷰에 노출되지 않는다(게시 게이트)', async () => {
    const { repo, db } = await makeRepo()
    repo.importProducts('S_OUT_HR', [row()])
    expect(queryRows(db, `SELECT id FROM v_published_products WHERE model_code = 'ZZZ011X'`)).toHaveLength(0)
  })

  it('OK 행이 없으면 아무것도 적재하지 않고 0을 반환한다', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length
    expect(repo.importProducts('S_OUT_HR', [row({ verdict: 'ERROR' })])).toBe(0)
    expect(repo.listProducts()).toHaveLength(before)
  })

  it('존재하지 않는 시리즈는 NOT_FOUND로 거부한다', async () => {
    const { repo } = await makeRepo()
    try {
      repo.importProducts('S_NOPE', [row()])
      throw new Error('예외가 발생하지 않았다')
    } catch (e) {
      expect((e as EquipmentDomainError).code).toBe('NOT_FOUND')
    }
  })

  it('중간에 실패하면 전부 롤백한다(부분 적재 없음)', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length
    // 두 번째 행이 시드의 기존 모델명과 충돌 → UNIQUE 위반 → 전체 롤백
    expect(() =>
      repo.importProducts('S_OUT_HR', [row(), row({ product: { ...row().product, modelCode: 'RPUW12BX9M' } })]),
    ).toThrow()
    expect(repo.listProducts()).toHaveLength(before)
    expect(repo.listProducts().some((r) => r.modelCode === 'ZZZ011X')).toBe(false)
  })
})

describe('종단: 실제 스펙시트 → 검증 → 적재 → 게시', () => {
  it('Multi V Super 5 ODU 4모델을 등록하면 HP·용량·최대연결수가 채워진다', async () => {
    const { repo } = await makeRepo()
    const parsed = await parsedFrom('mv_super5_odu.xlsx')
    const preview = classifyImport(parsed, {
      isOutdoor: true,
      existingModelCodes: repo.listProducts().map((r) => r.modelCode),
    })
    expect(preview).toMatchObject({ total: 4, ok: 4, error: 0, duplicate: 0 })

    expect(repo.importProducts('S_OUT_HR', preview.rows)).toBe(4)
    const added = repo.listProducts().find((r) => r.modelCode === 'RPUW281X9P')!
    expect(added).toMatchObject({ status: 'DRAFT', horsepower: 28, coolingW: 78400, heatingW: 88200, maxConnections: 45 })
  })

  it('게시하면 생성·검도가 읽는 PUBLISHED 스냅샷에 실외기로 들어온다', async () => {
    const { repo, db } = await makeRepo()
    const parsed = await parsedFrom('mv_super5_odu.xlsx')
    const preview = classifyImport(parsed, { isOutdoor: true, existingModelCodes: [] })
    repo.importProducts('S_OUT_HR', preview.rows)

    const id = repo.listProducts().find((r) => r.modelCode === 'RPUW281X9P')!.id
    repo.setStatus(id, 'PUBLISHED')

    const pub = queryRows(db, `SELECT model_code, horsepower, max_connections FROM v_published_products WHERE id = ${id}`)
    expect(pub).toHaveLength(1)
    expect(pub[0]).toMatchObject({ model_code: 'RPUW281X9P', horsepower: 28, max_connections: 45 })
  })

  it('같은 파일을 두 번 올리면 두 번째는 전부 DUPLICATE로 스킵된다', async () => {
    const { repo } = await makeRepo()
    const parsed = await parsedFrom('mv_super5_odu.xlsx')
    repo.importProducts('S_OUT_HR', classifyImport(parsed, { isOutdoor: true, existingModelCodes: [] }).rows)

    const second = classifyImport(parsed, {
      isOutdoor: true,
      existingModelCodes: repo.listProducts().map((r) => r.modelCode),
    })
    expect(second).toMatchObject({ ok: 0, duplicate: 4 })
    expect(repo.importProducts('S_OUT_HR', second.rows)).toBe(0)
  })

  it('GHP 시트는 조합 모델(GP-W560C2S = 56HP)까지 등록되고, 시드에 이미 있는 GPUW280C2S는 중복 스킵된다', async () => {
    const { repo } = await makeRepo()
    const parsed = await parsedFrom('ghp_super3_odu.xlsx')
    const preview = classifyImport(parsed, {
      isOutdoor: true,
      existingModelCodes: repo.listProducts().map((r) => r.modelCode),
    })
    expect(preview).toMatchObject({ total: 6, ok: 5, duplicate: 1, error: 0 })

    expect(repo.importProducts('S_OUT_GHP', preview.rows)).toBe(5)
    expect(repo.listProducts().find((r) => r.modelCode === 'GP-W560C2S')).toMatchObject({
      horsepower: 56, coolingW: 164000, energySource: 'GHP',
    })
  })
})

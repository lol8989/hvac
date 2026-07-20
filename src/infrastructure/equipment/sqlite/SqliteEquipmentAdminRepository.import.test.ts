// 스펙시트 업로드 일괄 적재(P3): 파서 → 검증 분류 → DRAFT 적재 + product_specs(JSONB).
// 실제 LG 시트(Multi V Super 5 ODU)로 등록 → 게시까지의 경로를 종단 고정한다.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import readXlsxFile from 'read-excel-file/node'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'
import { queryRows } from './query'
import { toParsedSheets, type SheetRow } from '../spec/specSheetRows'
import { classifyImport, type ImportRow, type ParsedProduct } from '../../../domain/equipment/SpecImport'
import type { EquipmentDomainError } from '../../../domain/equipment/errors'

// 실데이터 시드의 시리즈 코드(중분류로 스코프됨)
const HR_SERIES = 'S_CURATED_OUT_HR'
const GHP_SERIES = 'S_GHP_SUPER_III__OUT_GHP'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

async function makeRepo(onChange?: () => void) {
  const { db } = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
  return { repo: new SqliteEquipmentAdminRepository(db, { onChange, now: () => '2026-07-09T00:00:00.000Z' }), db }
}

const readFixture = async (name: string) =>
  (await readXlsxFile(resolve('src/test/fixtures', name))) as unknown as { sheet: string; data: SheetRow[] }[]

const parsedFrom = async (name: string): Promise<ParsedProduct[]> =>
  toParsedSheets(await readFixture(name)).flatMap((s) => s.products)

const row = (over: Partial<ImportRow> = {}): ImportRow => ({
  product: { modelCode: 'ZZZ011X', coolingW: 10000, heatingW: 11000, maxConnections: 5, specData: { '냉매 > 종류': { value: 'R410A', unit: null } } },
  horsepower: 1,
  hpSource: 'MODEL_CODE',
  verdict: 'OK',
  ...over,
})

describe('importProducts (스펙시트 일괄 등록)', () => {
  it('OK 행만 DRAFT로 적재하고 오류·중복 행은 건너뛴다', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length

    const inserted = repo.importProducts(HR_SERIES, [
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
    repo.importProducts(HR_SERIES, [row()])
    const id = repo.listProducts().find((r) => r.modelCode === 'ZZZ011X')!.id
    const spec = queryRows(db, `SELECT spec_data FROM product_specs WHERE product_id = ${id}`)[0]
    expect(JSON.parse(String(spec.spec_data))['냉매 > 종류']).toEqual({ value: 'R410A', unit: null })
  })

  it('업로드 직후에는 게시 뷰에 노출되지 않는다(게시 게이트)', async () => {
    const { repo, db } = await makeRepo()
    repo.importProducts(HR_SERIES, [row()])
    expect(queryRows(db, `SELECT id FROM v_published_products WHERE model_code = 'ZZZ011X'`)).toHaveLength(0)
  })

  it('OK 행이 없으면 아무것도 적재하지 않고 0을 반환한다', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length
    expect(repo.importProducts(HR_SERIES, [row({ verdict: 'ERROR' })])).toBe(0)
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
      repo.importProducts(HR_SERIES, [row(), row({ product: { ...row().product, modelCode: 'RPUW12BX9M' } })]),
    ).toThrow()
    expect(repo.listProducts()).toHaveLength(before)
    expect(repo.listProducts().some((r) => r.modelCode === 'ZZZ011X')).toBe(false)
  })
})

describe('종단: 실제 스펙시트 → 검증 → 적재 → 게시', () => {
  // 시드가 이미 스펙시트 전량(1,206모델)을 담고 있으므로, 같은 시트를 다시 올리면 전부 중복이다.
  const renamed = (ps: ParsedProduct[], suffix: string): ParsedProduct[] =>
    ps.map((p) => ({ ...p, modelCode: p.modelCode + suffix }))

  it('이미 적재된 시트를 다시 올리면 전량 DUPLICATE로 스킵된다(재업로드 안전)', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length
    const parsed = await parsedFrom('mv_super5_odu.xlsx')
    const preview = classifyImport(parsed, {
      isOutdoor: true,
      existingModelCodes: repo.listProducts().map((r) => r.modelCode),
    })
    expect(preview).toMatchObject({ total: 4, ok: 0, duplicate: 4, error: 0 })
    expect(repo.importProducts(HR_SERIES, preview.rows)).toBe(0)
    expect(repo.listProducts()).toHaveLength(before)
  })

  it('신규 모델은 HP·용량·최대연결수와 함께 DRAFT로 적재된다', async () => {
    const { repo } = await makeRepo()
    const parsed = renamed(await parsedFrom('mv_super5_odu.xlsx'), 'Z') // 시드에 없는 코드로 변형
    const preview = classifyImport(parsed, {
      isOutdoor: true,
      existingModelCodes: repo.listProducts().map((r) => r.modelCode),
    })
    expect(preview).toMatchObject({ total: 4, ok: 4, error: 0, duplicate: 0 })

    expect(repo.importProducts(HR_SERIES, preview.rows)).toBe(4)
    const added = repo.listProducts().find((r) => r.modelCode === 'RPUW281X9PZ')!
    expect(added).toMatchObject({ status: 'DRAFT', horsepower: 28, coolingW: 78400, heatingW: 88200, maxConnections: 45 })
  })

  it('게시하면 생성·검도가 읽는 PUBLISHED 스냅샷에 실외기로 들어온다', async () => {
    const { repo, db } = await makeRepo()
    const parsed = renamed(await parsedFrom('mv_super5_odu.xlsx'), 'Z')
    const preview = classifyImport(parsed, { isOutdoor: true, existingModelCodes: repo.listProducts().map((r) => r.modelCode) })
    repo.importProducts(HR_SERIES, preview.rows)

    const id = repo.listProducts().find((r) => r.modelCode === 'RPUW281X9PZ')!.id
    repo.setStatus(id, 'PUBLISHED')

    const pub = queryRows(db, `SELECT model_code, horsepower, max_connections FROM v_published_products WHERE id = ${id}`)
    expect(pub).toHaveLength(1)
    expect(pub[0]).toMatchObject({ model_code: 'RPUW281X9PZ', horsepower: 28, max_connections: 45 })
  })

  it('시드에 GHP 조합 모델(GP-W560C2S = 56HP)이 이미 실데이터로 들어 있다', async () => {
    const { repo } = await makeRepo()
    expect(repo.listProducts().find((r) => r.modelCode === 'GP-W560C2S')).toMatchObject({
      horsepower: 56, coolingW: 164000, energySource: 'GHP', status: 'PUBLISHED',
    })
  })

  it('GHP 시트를 신규 코드로 올리면 조합 모델까지 적재된다', async () => {
    const { repo } = await makeRepo()
    const parsed = renamed(await parsedFrom('ghp_super3_odu.xlsx'), 'Z')
    const preview = classifyImport(parsed, {
      isOutdoor: true,
      existingModelCodes: repo.listProducts().map((r) => r.modelCode),
    })
    expect(preview).toMatchObject({ total: 6, ok: 6, duplicate: 0, error: 0 })

    expect(repo.importProducts(GHP_SERIES, preview.rows)).toBe(6)
    expect(repo.listProducts().find((r) => r.modelCode === 'GP-W560C2SZ')).toMatchObject({
      horsepower: 56, coolingW: 164000, energySource: 'GHP',
    })
  })
})

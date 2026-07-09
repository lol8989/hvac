// 관리 리포지토리 쓰기(P2-S2): 등록/수정/게시전이.
// 도메인 불변식(게시본 잠금·허용 전이)이 저장소를 통과해 강제되는지 고정한다.
import { describe, it, expect, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'
import { queryRows } from './query'
import type { EquipmentDomainError } from '../../../domain/equipment/errors'
import type { ProductDraft } from '../../../domain/equipment/ProductDraft'
import { SEED_COUNTS } from '../seed/seedMeta'

// 실데이터 시드의 시리즈 코드(중분류로 스코프됨)
const GHP_SERIES = 'S_GHP_SUPER_III__OUT_GHP'
const IN_SERIES = 'S_CURATED_IN_4WAY'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

const FIXED_NOW = '2026-07-09T00:00:00.000Z'

async function makeRepo(onChange?: () => void) {
  const { db } = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
  const repo = new SqliteEquipmentAdminRepository(db, { onChange, now: () => FIXED_NOW })
  return { repo, db }
}

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  seriesCode: IN_SERIES,
  modelCode: 'RNW-NEW-001',
  equipmentCode: '99C',
  horsepower: null,
  coolingW: 5000,
  heatingW: 5600,
  maxConnections: null,
  ...over,
})

// 던져진 도메인 예외의 code를 꺼낸다(예외가 없으면 테스트 실패).
const codeOf = (fn: () => void): string => {
  try {
    fn()
  } catch (e) {
    return (e as EquipmentDomainError).code
  }
  throw new Error('예외가 발생하지 않았다')
}

const byModel = (repo: SqliteEquipmentAdminRepository, model: string) =>
  repo.listProducts().find((r) => r.modelCode === model)

const idOf = (repo: SqliteEquipmentAdminRepository, model: string): number => byModel(repo, model)!.id

describe('listSeries (등록 폼 선택지)', () => {
  it('시드의 전 시리즈를 분류·계열과 함께 반환한다', async () => {
    const { repo } = await makeRepo()
    const series = repo.listSeries()
    expect(series).toHaveLength(SEED_COUNTS.series)
    expect(series.find((s) => s.code === GHP_SERIES)).toMatchObject({
      categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: 'GHP', energySource: 'GHP',
    })
    expect(series.some((s) => s.energySource === 'ERV')).toBe(true) // 환기 계열도 노출
  })
})

describe('createProduct (등록)', () => {
  it('신규 제품은 항상 DRAFT로 생성되고 목록에 나타난다', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length
    const id = repo.createProduct(draft())
    expect(id).toBeGreaterThan(0)
    const row = byModel(repo, 'RNW-NEW-001')!
    expect(row).toMatchObject({ id, status: 'DRAFT', coolingW: 5000, heatingW: 5600, equipmentCode: '99C', categoryCode: 'INDOOR' })
    expect(repo.listProducts()).toHaveLength(before + 1)
  })

  it('신규 DRAFT는 게시 뷰(v_published_products)에 노출되지 않는다(게시 게이트)', async () => {
    const { repo, db } = await makeRepo()
    repo.createProduct(draft())
    const pub = queryRows(db, `SELECT model_code FROM v_published_products WHERE model_code = 'RNW-NEW-001'`)
    expect(pub).toHaveLength(0)
  })

  it('실외기 시리즈로 등록하면 마력·최대연결수가 저장된다', async () => {
    const { repo } = await makeRepo()
    repo.createProduct(draft({ seriesCode: GHP_SERIES, modelCode: 'GPUW-NEW', equipmentCode: null, horsepower: 20, coolingW: 56000, heatingW: 63000, maxConnections: 24 }))
    expect(byModel(repo, 'GPUW-NEW')).toMatchObject({ categoryCode: 'OUTDOOR', energySource: 'GHP', horsepower: 20, maxConnections: 24 })
  })

  it('모델명이 중복되면 DUPLICATE_MODEL_CODE로 거부하고 아무것도 남기지 않는다', async () => {
    const { repo } = await makeRepo()
    const before = repo.listProducts().length
    expect(codeOf(() => repo.createProduct(draft({ modelCode: 'RNW0401C2S' })))).toBe('DUPLICATE_MODEL_CODE')
    expect(repo.listProducts()).toHaveLength(before)
  })

  it('존재하지 않는 시리즈 코드는 NOT_FOUND로 거부한다', async () => {
    const { repo } = await makeRepo()
    expect(codeOf(() => repo.createProduct(draft({ seriesCode: 'S_NOPE' })))).toBe('NOT_FOUND')
  })

  it('도메인 유효성(음수 용량)을 저장소에서도 거부한다', async () => {
    const { repo } = await makeRepo()
    expect(codeOf(() => repo.createProduct(draft({ coolingW: -1 })))).toBe('INVALID_FIELD')
  })
})

describe('타임스탬프 노출 (등록일·수정일·게시일)', () => {
  it('신규 등록 행은 createdAt·updatedAt이 기록되고 publishedAt은 비어 있다', async () => {
    const { repo } = await makeRepo()
    repo.createProduct(draft())
    expect(byModel(repo, 'RNW-NEW-001')).toMatchObject({ createdAt: FIXED_NOW, updatedAt: FIXED_NOW, publishedAt: null })
  })

  it('시드된 제품에도 등록·수정 시각이 있고, 게시본만 게시 시각을 갖는다', async () => {
    const { repo } = await makeRepo()
    const pub = byModel(repo, 'RPUW12BX9M')! // 시드 PUBLISHED
    expect(pub.createdAt).toBeTruthy()
    expect(pub.updatedAt).toBeTruthy()
    expect(pub.publishedAt).toBeTruthy()
    const draft = byModel(repo, 'RNW9999DRAFT')! // 시드 DRAFT — 미게시
    expect(draft.createdAt).toBeTruthy()
    expect(draft.publishedAt).toBeNull()
  })

  it('게시하면 publishedAt·updatedAt이 목록 행에 노출된다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    repo.setStatus(id, 'PUBLISHED')
    expect(byModel(repo, 'RNW9999DRAFT')).toMatchObject({ publishedAt: FIXED_NOW, updatedAt: FIXED_NOW })
  })
})

describe('updateProduct (수정 — 게시본 잠금)', () => {
  it('DRAFT 제품의 스펙을 수정한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    repo.updateProduct(id, { coolingW: 9500 })
    expect(byModel(repo, 'RNW9999DRAFT')).toMatchObject({ coolingW: 9500, heatingW: 10000 }) // 미지정 필드는 유지
  })

  it('부분 수정: 모델명만 바꿔도 나머지 필드가 보존된다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    repo.updateProduct(id, { modelCode: 'RNW9999RENAMED' })
    expect(byModel(repo, 'RNW9999RENAMED')).toMatchObject({ coolingW: 9000, heatingW: 10000, equipmentCode: 'DRAFT99' })
  })

  it('PUBLISHED 제품의 스펙 수정은 SPEC_LOCKED로 거부한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RPUW12BX9M')
    expect(codeOf(() => repo.updateProduct(id, { coolingW: 1 }))).toBe('SPEC_LOCKED')
    expect(byModel(repo, 'RPUW12BX9M')!.coolingW).toBe(34800) // 원본 불변
  })

  it('ARCHIVED 제품의 스펙 수정도 SPEC_LOCKED로 거부한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RPUW-ARCHIVED')
    expect(codeOf(() => repo.updateProduct(id, { coolingW: 1 }))).toBe('SPEC_LOCKED')
  })

  it('없는 제품 수정은 NOT_FOUND', async () => {
    const { repo } = await makeRepo()
    expect(codeOf(() => repo.updateProduct(99999, { coolingW: 1 }))).toBe('NOT_FOUND')
  })

  it('다른 제품과 모델명이 겹치면 DUPLICATE_MODEL_CODE', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    expect(codeOf(() => repo.updateProduct(id, { modelCode: 'RNW0401C2S' }))).toBe('DUPLICATE_MODEL_CODE')
  })

  it('자기 자신과 같은 모델명으로의 수정은 허용한다(no-op 저장)', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    expect(() => repo.updateProduct(id, { modelCode: 'RNW9999DRAFT', coolingW: 9100 })).not.toThrow()
    expect(byModel(repo, 'RNW9999DRAFT')!.coolingW).toBe(9100)
  })

  it('병합 결과 냉·난방 용량이 모두 비면 INVALID_FIELD로 거부한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    repo.updateProduct(id, { coolingW: null }) // 난방만 남음 → 허용
    expect(codeOf(() => repo.updateProduct(id, { heatingW: null }))).toBe('INVALID_FIELD')
  })
})

describe('setStatus (게시 전이 — 선형 + 재게시)', () => {
  it('DRAFT→PUBLISHED 게시하면 게시 뷰에 노출되고 published_at이 기록된다', async () => {
    const { repo, db } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    repo.setStatus(id, 'PUBLISHED')
    expect(byModel(repo, 'RNW9999DRAFT')!.status).toBe('PUBLISHED')
    expect(queryRows(db, `SELECT model_code FROM v_published_products WHERE id = ${id}`)).toHaveLength(1)
    expect(queryRows(db, `SELECT published_at FROM products WHERE id = ${id}`)[0].published_at).toBe(FIXED_NOW)
  })

  it('PUBLISHED→ARCHIVED 보관하면 게시 뷰에서 사라지고 discontinued_at이 기록된다', async () => {
    const { repo, db } = await makeRepo()
    const id = idOf(repo, 'RPUW12BX9M')
    repo.setStatus(id, 'ARCHIVED')
    expect(byModel(repo, 'RPUW12BX9M')!.status).toBe('ARCHIVED')
    expect(queryRows(db, `SELECT id FROM v_published_products WHERE id = ${id}`)).toHaveLength(0)
    expect(queryRows(db, `SELECT discontinued_at FROM products WHERE id = ${id}`)[0].discontinued_at).toBe(FIXED_NOW)
  })

  it('ARCHIVED→PUBLISHED 재게시하면 다시 노출되고 discontinued_at이 해제된다', async () => {
    const { repo, db } = await makeRepo()
    const id = idOf(repo, 'RPUW-ARCHIVED')
    repo.setStatus(id, 'PUBLISHED')
    expect(byModel(repo, 'RPUW-ARCHIVED')!.status).toBe('PUBLISHED')
    expect(queryRows(db, `SELECT id FROM v_published_products WHERE id = ${id}`)).toHaveLength(1)
    expect(queryRows(db, `SELECT discontinued_at FROM products WHERE id = ${id}`)[0].discontinued_at).toBeNull()
  })

  it('DRAFT→ARCHIVED 등록 취소를 허용한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RNW9999DRAFT')
    expect(() => repo.setStatus(id, 'ARCHIVED')).not.toThrow()
  })

  it('게시 취소(PUBLISHED→DRAFT)는 INVALID_TRANSITION으로 거부하고 상태를 유지한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RPUW12BX9M')
    expect(codeOf(() => repo.setStatus(id, 'DRAFT'))).toBe('INVALID_TRANSITION')
    expect(byModel(repo, 'RPUW12BX9M')!.status).toBe('PUBLISHED')
  })

  it('보관 해제(ARCHIVED→DRAFT)는 INVALID_TRANSITION으로 거부한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RPUW-ARCHIVED')
    expect(codeOf(() => repo.setStatus(id, 'DRAFT'))).toBe('INVALID_TRANSITION')
  })

  it('같은 상태로의 전이는 INVALID_TRANSITION으로 거부한다', async () => {
    const { repo } = await makeRepo()
    const id = idOf(repo, 'RPUW12BX9M')
    expect(codeOf(() => repo.setStatus(id, 'PUBLISHED'))).toBe('INVALID_TRANSITION')
  })

  it('없는 제품의 전이는 NOT_FOUND', async () => {
    const { repo } = await makeRepo()
    expect(codeOf(() => repo.setStatus(99999, 'PUBLISHED'))).toBe('NOT_FOUND')
  })
})

describe('영속 훅(onChange)', () => {
  it('성공한 쓰기마다 1회 호출된다', async () => {
    const onChange = vi.fn()
    const { repo } = await makeRepo(onChange)
    repo.createProduct(draft())
    expect(onChange).toHaveBeenCalledTimes(1)
    repo.setStatus(idOf(repo, 'RNW-NEW-001'), 'PUBLISHED')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('읽기(listProducts)와 실패한 쓰기에서는 호출되지 않는다', async () => {
    const onChange = vi.fn()
    const { repo } = await makeRepo(onChange)
    repo.listProducts()
    repo.listSeries()
    codeOf(() => repo.createProduct(draft({ modelCode: 'RNW0401C2S' }))) // 중복 → 실패
    codeOf(() => repo.setStatus(idOf(repo, 'RPUW12BX9M'), 'DRAFT')) // 금지 전이 → 실패
    expect(onChange).not.toHaveBeenCalled()
  })
})

// 롤백: 트랜잭션 중간 실패가 부분 상태를 남기지 않는다.
describe('트랜잭션 롤백', () => {
  it('중복 모델명 등록 실패 후에도 DB가 깨지지 않고 후속 쓰기가 정상 동작한다', async () => {
    const { repo, db } = await makeRepo()
    codeOf(() => repo.createProduct(draft({ modelCode: 'RNW0401C2S' })))
    const id = repo.createProduct(draft({ modelCode: 'RNW-OK' }))
    expect(id).toBeGreaterThan(0)
    expect(queryRows(db as Database, `SELECT COUNT(*) AS c FROM products WHERE model_code = 'RNW-OK'`)[0].c).toBe(1)
  })
})

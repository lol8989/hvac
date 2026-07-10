// product_specs 조회 — 지금까지 INSERT 경로만 있었고 SELECT가 없었다.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteSpecRepository } from './SqliteSpecRepository'
import { specValue, SPEC_KEYS } from '../../../domain/equipment/SpecLookup'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

const makeRepo = async () => {
  const handle = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
  return new SqliteSpecRepository(handle.db)
}

describe('SqliteSpecRepository.specsOf', () => {
  it('모델명으로 롱테일 스펙을 돌려준다', async () => {
    const repo = await makeRepo()
    const specs = repo.specsOf(['RNW0201C2S'])
    const spec = specs.get('RNW0201C2S')!
    expect(spec).toBeDefined()
    expect(specValue(spec, SPEC_KEYS.전원)).toBe('220, 1상(2선), 60')
    expect(specValue(spec, SPEC_KEYS.액관)).toBe('Φ6.35 (1/4)')
    expect(specValue(spec, SPEC_KEYS.본체중량)).toBe('11.7')
  })

  it('계열이 달라도 같은 의미 상수로 조회된다 (GHP 실외기)', async () => {
    const repo = await makeRepo()
    const spec = repo.specsOf(['GPUW280C2S']).get('GPUW280C2S')!
    expect(specValue(spec, SPEC_KEYS.액관)).toBe('19.05')
    expect(specValue(spec, SPEC_KEYS.가스종)).toContain('LNG')
    expect(specValue(spec, SPEC_KEYS.압축기형식)).toBe('Scroll x 2')
  })

  it('여러 모델을 한 번에 조회한다', async () => {
    const repo = await makeRepo()
    const specs = repo.specsOf(['RNW0201C2S', 'GPUW280C2S'])
    expect(specs.size).toBe(2)
  })

  it('스펙이 없는 모델은 결과 맵에서 빠진다', async () => {
    const repo = await makeRepo()
    const specs = repo.specsOf(['NO_SUCH_MODEL'])
    expect(specs.size).toBe(0)
  })

  it('빈 목록이면 빈 맵 (쿼리하지 않는다)', async () => {
    const repo = await makeRepo()
    expect(repo.specsOf([]).size).toBe(0)
  })

  it('게시 상태와 무관하게 조회한다 (일람표는 선정된 모델을 그린다)', async () => {
    const repo = await makeRepo()
    // ACAH020LET2는 시드에서 DRAFT다.
    expect(repo.specsOf(['ACAH020LET2']).size).toBe(1)
  })
})

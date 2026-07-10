// 조합비 정책 저장소 (주인님 지시 2026-07-10: 전역 기본 + 실외기 모델별 override).
//
// 정책은 스펙이 아니다 → 게시본(PUBLISHED)도 조정할 수 있어야 한다(스펙 잠금과 무관).
// 저장 즉시 생성단 실외기 카탈로그(publishedOutdoor)의 comboMin/Max에 반영돼야 한다.
import { describe, it, expect } from 'vitest'
import initSqlJs from 'sql.js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadNodeSeed } from '../../../test/seedFixture'
import { createSqliteEquipmentMaster } from './SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './SqliteEquipmentAdminRepository'
import { ComboRange } from '../../../domain/shared/ComboRange'
import type { EquipmentDomainError } from '../../../domain/equipment/errors'

const nodeInit = () => {
  const bytes = new Uint8Array(readFileSync(resolve('node_modules/sql.js/dist/sql-wasm.wasm')))
  return initSqlJs({ wasmBinary: bytes.buffer })
}

async function makeRepo(onChange?: () => void) {
  const handle = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed })
  return { repo: new SqliteEquipmentAdminRepository(handle.db, { onChange }), db: handle.db }
}

// 정책 변경을 생성단이 보는 값으로 다시 읽는다(같은 db 바이트로 마스터 재부팅).
const outdoorOf = async (db: import('sql.js').Database, model: string) => {
  const bytes = db.export()
  const master = await createSqliteEquipmentMaster({ initSql: nodeInit, loadSeed: loadNodeSeed, store: { load: () => Promise.resolve(bytes), save: () => Promise.resolve() } })
  return master.publishedOutdoor().find((m) => m.model === model)!
}

const PUBLISHED_ODU = 'RPUW12BX9M' // 큐레이션 게시본

describe('getComboPolicy', () => {
  it('시드 직후 전역 기본은 도메인 DEFAULT(0.5~1.03)이고 override는 없다', async () => {
    const { repo } = await makeRepo()
    const p = repo.getComboPolicy()
    expect(p.global.equals(ComboRange.DEFAULT)).toBe(true)
    expect(p.overrideEntries()).toEqual([])
    expect(p.rangeFor(PUBLISHED_ODU).equals(ComboRange.DEFAULT)).toBe(true)
  })
})

describe('saveGlobalComboRange', () => {
  it('전역 기본을 바꾸면 override 없는 실외기의 허용범위가 따라 바뀐다', async () => {
    const { repo, db } = await makeRepo()
    repo.saveGlobalComboRange(new ComboRange(0.6, 1.2))

    expect(repo.getComboPolicy().global.max).toBe(1.2)
    const spec = await outdoorOf(db, PUBLISHED_ODU)
    expect(spec.comboMin).toBe(0.6)
    expect(spec.comboMax).toBe(1.2)
  })

  it('불변식을 깨는 값은 거부한다', async () => {
    const { repo } = await makeRepo()
    expect(() => repo.saveGlobalComboRange({ min: 1.2, max: 1.0 } as ComboRange)).toThrow()
  })

  it('저장 성공 시 영속 훅을 부른다', async () => {
    let calls = 0
    const { repo } = await makeRepo(() => calls++)
    repo.saveGlobalComboRange(new ComboRange(0.5, 1.1))
    expect(calls).toBe(1)
  })
})

describe('setProductComboRange', () => {
  it('모델별 override가 전역 기본을 이긴다', async () => {
    const { repo, db } = await makeRepo()
    repo.setProductComboRange(PUBLISHED_ODU, new ComboRange(0.5, 1.12))

    expect(repo.getComboPolicy().rangeFor(PUBLISHED_ODU).max).toBe(1.12)
    expect(await outdoorOf(db, PUBLISHED_ODU).then((s) => s.comboMax)).toBe(1.12)
  })

  it('override가 걸린 모델은 전역 기본을 바꿔도 흔들리지 않는다', async () => {
    const { repo, db } = await makeRepo()
    repo.setProductComboRange(PUBLISHED_ODU, new ComboRange(0.5, 1.12))
    repo.saveGlobalComboRange(new ComboRange(0.4, 0.9))

    const spec = await outdoorOf(db, PUBLISHED_ODU)
    expect(spec.comboMax).toBe(1.12) // override 유지
  })

  it('null을 주면 override를 걷어내고 전역 기본으로 되돌린다', async () => {
    const { repo, db } = await makeRepo()
    repo.setProductComboRange(PUBLISHED_ODU, new ComboRange(0.5, 1.12))
    repo.setProductComboRange(PUBLISHED_ODU, null)

    expect(repo.getComboPolicy().hasOverride(PUBLISHED_ODU)).toBe(false)
    expect(await outdoorOf(db, PUBLISHED_ODU).then((s) => s.comboMax)).toBe(ComboRange.DEFAULT.max)
  })

  // 조합비는 스펙이 아니라 정책이다 — 게시본 스펙 잠금(SPEC_LOCKED)에 걸리지 않는다.
  it('게시본(PUBLISHED)도 조합비는 조정할 수 있다', async () => {
    const { repo } = await makeRepo()
    const row = repo.listProducts().find((r) => r.modelCode === PUBLISHED_ODU)!
    expect(row.status).toBe('PUBLISHED')
    expect(() => repo.setProductComboRange(PUBLISHED_ODU, new ComboRange(0.5, 1.1))).not.toThrow()
  })

  it('없는 모델은 NOT_FOUND', async () => {
    const { repo } = await makeRepo()
    try {
      repo.setProductComboRange('NO_SUCH_MODEL', new ComboRange(0.5, 1.1))
      throw new Error('예외가 발생하지 않았다')
    } catch (e) {
      expect((e as EquipmentDomainError).code).toBe('NOT_FOUND')
    }
  })
})

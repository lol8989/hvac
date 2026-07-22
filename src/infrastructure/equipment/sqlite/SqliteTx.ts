// SQLite 쓰기 컨텍스트 — 트랜잭션·영속 훅·타임스탬프를 한곳에 모아 여러 리포지토리가 공유한다.
// 쓰기를 원자적으로 실행하고 성공 시에만 영속 훅(onChange)을 부른다. 실패 시 롤백.

import type { Database } from 'sql.js'

export interface SqliteTxDeps {
  onChange?: () => void // 쓰기 성공 후 영속 훅(db.export() → IndexedDB)
  now?: () => string // 타임스탬프 주입(테스트 결정성)
}

export class SqliteTx {
  private readonly onChange: () => void
  readonly now: () => string

  constructor(
    readonly db: Database,
    deps: SqliteTxDeps = {},
  ) {
    this.onChange = deps.onChange ?? (() => {})
    this.now = deps.now ?? (() => new Date().toISOString())
  }

  // 쓰기를 원자적으로 실행하고, 성공 시에만 영속 훅을 부른다. 실패 시 롤백.
  run<T>(fn: () => T): T {
    this.db.run('BEGIN')
    let out: T
    try {
      out = fn()
    } catch (e) {
      this.db.run('ROLLBACK')
      throw e
    }
    this.db.run('COMMIT')
    this.onChange()
    return out
  }
}

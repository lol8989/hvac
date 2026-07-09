// sql.js 조회 헬퍼 (읽기 마스터·관리 리포지토리 공유).
import type { Database } from 'sql.js'

// exec 결과(첫 결과셋)를 {컬럼:값} 객체 배열로. params 지정 시 prepared statement로 바인딩.
export function queryRows(db: Database, sql: string, params?: unknown[]): Record<string, unknown>[] {
  if (params && params.length) {
    const stmt = db.prepare(sql)
    try {
      stmt.bind(params as never[])
      const out: Record<string, unknown>[] = []
      while (stmt.step()) out.push(stmt.getAsObject())
      return out
    } finally {
      stmt.free()
    }
  }
  const res = db.exec(sql)
  if (!res.length) return []
  const { columns, values } = res[0]
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
}

export const num = (v: unknown): number => v as number
export const numOrNull = (v: unknown): number | null => (v == null ? null : (v as number))
export const strOrNull = (v: unknown): string | null => (v == null ? null : String(v))

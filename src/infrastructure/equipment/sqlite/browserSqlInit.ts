// 브라우저용 sql.js 초기화 — WASM을 Vite 에셋 URL(?url)로 로드해 locateFile로 지정한다.
// (노드/테스트는 fs wasmBinary를 쓰는 별도 initSql을 주입 → 이 파일은 브라우저 전용.)
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type { SqlInit } from './SqliteEquipmentMaster'

export const browserSqlInit: SqlInit = () => initSqlJs({ locateFile: () => wasmUrl })

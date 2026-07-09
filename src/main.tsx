import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import SelectionReviewWindow from './components/selection/SelectionReviewWindow'
import EquipmentAdminPage from './components/equipment/EquipmentAdminPage'
import './styles.css'
import { createSqliteEquipmentMaster, type SqliteEquipmentMasterHandle } from './infrastructure/equipment/sqlite/SqliteEquipmentMaster'
import { SqliteEquipmentAdminRepository } from './infrastructure/equipment/sqlite/SqliteEquipmentAdminRepository'
import { browserSqlInit } from './infrastructure/equipment/sqlite/browserSqlInit'
import { createIdbBytesStore } from './infrastructure/equipment/sqlite/idbStore'
import { SCHEMA_VERSION } from './infrastructure/equipment/sqlite/schema'
import { defaultEquipmentMaster } from './infrastructure/equipment/InMemoryEquipmentMaster'
import { SEED_HASH } from './infrastructure/equipment/seedData'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

// 라우팅(POC): ?view=selection → 장비선정표 새 창, ?view=equipment → 장비마스터 관리, 그 외 → 생성 작업 앱.
const view = new URLSearchParams(window.location.search).get('view')

// 프라미스가 제때 settle하지 않아도 앱이 멈추지 않도록 타임아웃 레이스.
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms))])

// 장비마스터(SSOT): SQLite 백엔드(sql.js+IndexedDB) 부팅. 캐시 키에 SEED_HASH 포함(시드 변경 자동 무효화).
// 초기화 실패/지연(WASM 스톨 등) 시 null → 호출측이 폴백 처리.
const bytesStore = createIdbBytesStore(`db.v${SCHEMA_VERSION}.${SEED_HASH}`)

async function resolveSqliteHandle(): Promise<SqliteEquipmentMasterHandle | null> {
  try {
    return await withTimeout(
      createSqliteEquipmentMaster({ initSql: browserSqlInit, store: bytesStore }),
      8000,
      'SQLite init',
    )
  } catch (e) {
    console.error('[EquipmentMaster] SQLite 초기화 실패/지연', e)
    return null
  }
}

// 관리 페이지 쓰기(등록·수정·게시·단가) 후 DB 바이트를 IndexedDB에 저장한다.
// 커밋 직후 호출되므로 실패해도 메모리 상태는 유효 — 다음 쓰기에서 다시 저장된다.
const persistOn = (handle: SqliteEquipmentMasterHandle) => () => {
  void bytesStore.save(handle.db.export()).catch((e) => console.error('[EquipmentMaster] 영속 저장 실패', e))
}

const root = createRoot(rootEl)
const render = (node: React.ReactNode) => root.render(<React.StrictMode>{node}</React.StrictMode>)

if (view === 'selection') {
  render(<SelectionReviewWindow />)
} else if (view === 'equipment') {
  // 관리 페이지는 전 상태 편집을 위해 SQLite DB 핸들이 필요하다(인메모리 폴백은 읽기 전용 → 불가).
  const handle = await resolveSqliteHandle()
  render(
    handle ? (
      <EquipmentAdminPage admin={new SqliteEquipmentAdminRepository(handle.db, { onChange: persistOn(handle) })} />
    ) : (
      <div style={{ padding: 40, fontFamily: "'Noto Sans KR',sans-serif", color: '#666' }}>
        장비마스터 저장소(SQLite) 초기화에 실패했습니다. 새로고침하거나 브라우저 저장소 설정을 확인하세요.
      </div>
    ),
  )
} else {
  // 생성/검도는 PUBLISHED만 읽으므로 SQLite 실패 시 인메모리 기본으로 폴백(앱은 항상 렌더).
  const handle = await resolveSqliteHandle()
  render(<App master={handle ?? defaultEquipmentMaster} />)
}

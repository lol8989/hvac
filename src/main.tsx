import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import SelectionReviewWindow from './components/selection/SelectionReviewWindow'
import './styles.css'
import type { EquipmentMaster } from './domain/equipment/EquipmentMaster'
import { createSqliteEquipmentMaster } from './infrastructure/equipment/sqlite/SqliteEquipmentMaster'
import { browserSqlInit } from './infrastructure/equipment/sqlite/browserSqlInit'
import { createIdbBytesStore } from './infrastructure/equipment/sqlite/idbStore'
import { SCHEMA_VERSION } from './infrastructure/equipment/sqlite/schema'
import { defaultEquipmentMaster } from './infrastructure/equipment/InMemoryEquipmentMaster'
import { SEED_HASH } from './infrastructure/equipment/seedData'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root 엘리먼트를 찾을 수 없습니다')

// ?view=selection → 장비선정표 '새 창' 페이지(도면을 가리지 않는 별도 창), 그 외 → 생성 작업 앱.
const isSelectionWindow = new URLSearchParams(window.location.search).get('view') === 'selection'

// 프라미스가 제때 settle하지 않아도 앱이 멈추지 않도록 타임아웃 레이스.
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms))])

// 장비마스터(SSOT): SQLite 백엔드(sql.js+IndexedDB) 부팅 → PUBLISHED 스냅샷 주입.
// 캐시 키에 SEED_HASH를 포함해 시드 값 변경 시 자동 무효화(인메모리와 동치 유지).
// 초기화 실패/지연(WASM 스톨 등) 시 인메모리 기본으로 폴백 → "앱은 항상 렌더"를 실제로 보장.
async function resolveEquipmentMaster(): Promise<EquipmentMaster> {
  try {
    return await withTimeout(
      createSqliteEquipmentMaster({
        initSql: browserSqlInit,
        store: createIdbBytesStore(`db.v${SCHEMA_VERSION}.${SEED_HASH}`),
      }),
      8000,
      'SQLite init',
    )
  } catch (e) {
    console.error('[EquipmentMaster] SQLite 초기화 실패/지연 — 인메모리 폴백', e)
    return defaultEquipmentMaster
  }
}

const root = createRoot(rootEl)

if (isSelectionWindow) {
  root.render(
    <React.StrictMode>
      <SelectionReviewWindow />
    </React.StrictMode>,
  )
} else {
  const master = await resolveEquipmentMaster()
  root.render(
    <React.StrictMode>
      <App master={master} />
    </React.StrictMode>,
  )
}

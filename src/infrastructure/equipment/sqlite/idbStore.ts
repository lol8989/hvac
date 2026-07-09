// 브라우저 IndexedDB 기반 DB 바이트 영속 스토어 (BytesStore 구현).
// 무효화는 호출측이 키에 스키마 구조 버전 + 시드 내용 해시를 넣어 처리한다
// (예 `db.v${SCHEMA_VERSION}.${SEED_HASH}`) → 구조 OR 시드 값이 바뀌면 키가 달라져 옛 캐시가 자연 무효화.
import type { BytesStore } from './SqliteEquipmentMaster'

const DB_NAME = 'equipment-master'
const STORE = 'kv'

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export function createIdbBytesStore(key: string): BytesStore {
  return {
    async load() {
      const db = await openIdb()
      try {
        const v = await tx<unknown>(db, 'readonly', (s) => s.get(key))
        return v instanceof Uint8Array ? v : null
      } finally {
        db.close()
      }
    },
    async save(bytes) {
      const db = await openIdb()
      try {
        await tx(db, 'readwrite', (s) => s.put(bytes, key))
      } finally {
        db.close()
      }
    },
  }
}

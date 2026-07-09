// 시드 내용 해시(SEED_HASH) — IndexedDB 캐시 무효화 계약.
// 시드 '값'이 바뀌면 해시가 달라져야 옛 캐시가 무효화되고, 재방문 사용자도 인메모리와 동치가 유지된다.
import { describe, it, expect } from 'vitest'
import { fnv1a, SEED_HASH, INDOOR_RECORDS, OUTDOOR_RECORDS } from './seedData'

describe('SEED_HASH (시드 내용 해시 → 캐시 무효화)', () => {
  it('현재 시드 직렬화의 FNV-1a와 일치하고 비어있지 않다', () => {
    expect(SEED_HASH).toBe(fnv1a(JSON.stringify([INDOOR_RECORDS, OUTDOOR_RECORDS])))
    expect(SEED_HASH.length).toBeGreaterThan(0)
  })

  it('단가 1건만 바뀌어도 해시가 달라진다(→ 키 변경 → 옛 캐시 무효화)', () => {
    const mutated = OUTDOOR_RECORDS.map((r, i) => (i === 0 ? { ...r, priceKrw: r.priceKrw + 1 } : r))
    expect(fnv1a(JSON.stringify([INDOOR_RECORDS, mutated]))).not.toBe(SEED_HASH)
  })

  it('모델이 추가되어도 해시가 달라진다', () => {
    const added = [...INDOOR_RECORDS, { ...INDOOR_RECORDS[0], code: 'NEW1', model: 'RNW-NEW1' }]
    expect(fnv1a(JSON.stringify([added, OUTDOOR_RECORDS]))).not.toBe(SEED_HASH)
  })

  it('fnv1a는 결정적이다(같은 입력 → 같은 해시, 다른 입력 → 다른 해시)', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'))
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'))
  })
})

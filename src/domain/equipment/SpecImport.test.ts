// 업로드 미리보기 분류(정상/오류/중복) — Figma 「검증 요약」 타일의 근거.
import { describe, it, expect } from 'vitest'
import { classifyImport, type ParsedProduct } from './SpecImport'

const p = (over: Partial<ParsedProduct> = {}): ParsedProduct => ({
  modelCode: 'RPUW281X9P',
  coolingW: 78400,
  heatingW: 88200,
  maxConnections: 45,
  specData: {},
  ...over,
})

const outdoor = (products: ParsedProduct[], existing: string[] = []) =>
  classifyImport(products, { isOutdoor: true, existingModelCodes: existing })

describe('classifyImport (업로드 검증)', () => {
  it('정상 실외기는 OK이고 모델명에서 HP를 유도한다', () => {
    const r = outdoor([p()])
    expect(r).toMatchObject({ total: 1, ok: 1, error: 0, duplicate: 0 })
    expect(r.rows[0]).toMatchObject({ verdict: 'OK', horsepower: 28 })
  })

  it('마스터에 이미 있는 모델명은 DUPLICATE로 스킵한다(대소문자·공백 무시)', () => {
    const r = outdoor([p()], ['  rpuw281x9p '])
    expect(r).toMatchObject({ ok: 0, duplicate: 1 })
    expect(r.rows[0].reason).toBe('이미 등록된 모델명입니다')
  })

  it('같은 파일 안의 중복 모델명은 첫 건만 OK, 나머지는 DUPLICATE', () => {
    const r = outdoor([p(), p()])
    expect(r).toMatchObject({ total: 2, ok: 1, duplicate: 1 })
    expect(r.rows[1].reason).toBe('같은 파일 안에서 중복된 모델명입니다')
  })

  it('냉·난방 용량을 모두 못 읽으면 ERROR', () => {
    const r = outdoor([p({ coolingW: null, heatingW: null })])
    expect(r).toMatchObject({ ok: 0, error: 1 })
    expect(r.rows[0].reason).toContain('용량')
  })

  it('한쪽 용량만 있어도 OK다(냉방전용 실외기)', () => {
    expect(outdoor([p({ heatingW: null })]).ok).toBe(1)
  })

  it('모델명에서 HP를 못 뽑는 실외기는 ERROR (샤시명 등 오인 유입 차단)', () => {
    const r = outdoor([p({ modelCode: 'UXB' })])
    expect(r).toMatchObject({ ok: 0, error: 1 })
    expect(r.rows[0].reason).toContain('마력(HP)')
  })

  it('실내기 업로드는 HP를 요구하지 않는다', () => {
    const r = classifyImport([p({ modelCode: 'RNW0401C2S', coolingW: 4000, heatingW: 4500, maxConnections: null })], {
      isOutdoor: false,
      existingModelCodes: [],
    })
    expect(r).toMatchObject({ ok: 1, error: 0 })
    expect(r.rows[0].horsepower).toBeNull()
  })

  it('빈 모델명은 ERROR', () => {
    expect(outdoor([p({ modelCode: '  ' })])).toMatchObject({ ok: 0, error: 1 })
  })

  it('오류 행은 중복 판정에 참여하지 않는다(같은 빈 모델명 2건 → 둘 다 ERROR)', () => {
    const r = outdoor([p({ modelCode: '' }), p({ modelCode: '' })])
    expect(r).toMatchObject({ error: 2, duplicate: 0 })
  })

  it('정상·오류·중복이 섞이면 총계가 각 분류의 합과 같다', () => {
    const r = outdoor([p(), p(), p({ modelCode: 'RPUW301X9P' }), p({ modelCode: 'UXB' })], [])
    expect(r.total).toBe(4)
    expect(r.ok + r.error + r.duplicate).toBe(r.total)
    expect(r).toMatchObject({ ok: 2, duplicate: 1, error: 1 })
  })
})

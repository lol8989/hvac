// 롱테일 스펙 조회 — 라벨이 계열마다 다르므로 '후보 키'를 순서대로 훑는다.
// 근거: doc/05_설계결정/일람표_컬럼_매핑표.md §4-(1)
//   냉방능력: 실내기 '냉방능력 > 공칭용량' / 실외기 '냉방능력 > 정격' (변종 21개)
//   배관경  : 실내기 '냉매 연결 배관경 > 액관' / GHP '배관경 > 냉매 액관' (변종 55개)
import { describe, it, expect } from 'vitest'
import { specValue, SPEC_KEYS } from './SpecLookup'
import type { SpecCell } from './SpecImport'

const cell = (value: string, unit: string | null = null): SpecCell => ({ value, unit })

const INDOOR = {
  '전원 > Case 1': cell('220, 1상(2선), 60', 'V, Phase, Hz'),
  '냉매 연결 배관경 > 액관': cell('Φ6.35 (1/4)', 'mm(inch)'),
  '제품중량 > 본체중량': cell('11.7', 'kg'),
}

const GHP = {
  '배관경 > 냉매 액관': cell('19.05', 'ø,mm'),
  '제품중량 > 본체중량': cell('725', 'kg'),
}

describe('specValue — 후보 키를 순서대로 훑는다', () => {
  it('첫 번째로 맞는 후보 키의 값을 낸다', () => {
    expect(specValue(INDOOR, SPEC_KEYS.액관)).toBe('Φ6.35 (1/4)')
    expect(specValue(GHP, SPEC_KEYS.액관)).toBe('19.05')
  })

  it('계열이 달라도 같은 의미면 같은 상수로 조회된다', () => {
    expect(specValue(INDOOR, SPEC_KEYS.본체중량)).toBe('11.7')
    expect(specValue(GHP, SPEC_KEYS.본체중량)).toBe('725')
  })

  it('맞는 키가 없으면 null (값을 지어내지 않는다)', () => {
    expect(specValue(GHP, SPEC_KEYS.전원)).toBeNull()
    expect(specValue({}, SPEC_KEYS.액관)).toBeNull()
  })

  it('키 비교는 공백에 흔들리지 않는다', () => {
    expect(specValue({ '제품중량  >  본체중량': cell('9.9') }, SPEC_KEYS.본체중량)).toBe('9.9')
  })

  it('값이 비어 있으면 null로 본다', () => {
    expect(specValue({ '제품중량 > 본체중량': cell('-') }, SPEC_KEYS.본체중량)).toBeNull()
    expect(specValue({ '제품중량 > 본체중량': cell('  ') }, SPEC_KEYS.본체중량)).toBeNull()
  })
})

describe('SPEC_KEYS — 후보 목록', () => {
  it('의미마다 실내기·실외기 라벨을 모두 담는다', () => {
    expect(SPEC_KEYS.액관).toContain('냉매 연결 배관경 > 액관')
    expect(SPEC_KEYS.액관).toContain('배관경 > 냉매 액관')
    expect(SPEC_KEYS.가스관).toContain('냉매 연결 배관경 > 가스관')
    expect(SPEC_KEYS.가스관).toContain('배관경 > 냉매 가스관')
  })

  it('후보는 빈 배열이 아니다', () => {
    for (const [name, keys] of Object.entries(SPEC_KEYS)) {
      expect(keys.length, name).toBeGreaterThan(0)
    }
  })
})

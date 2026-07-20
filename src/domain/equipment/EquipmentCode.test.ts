import { describe, it, expect } from 'vitest'
import { indoorEquipmentCode, EQUIPMENT_CODE_LETTERS } from './EquipmentCode'

describe('실내기 장비번호 산식', () => {
  // 0708 회의록: 1웨이 C · 2웨이 G · 4웨이 T · 스탠드 P
  // 큐레이션 실측으로 산식이 확인된다 — 냉방W ÷ 100 + 유형문자.
  it('큐레이션 게시본의 실제 장비번호를 재현한다', () => {
    expect(indoorEquipmentCode('1WAY 카세트', 2000)).toBe('20C')
    expect(indoorEquipmentCode('1WAY 카세트', 2300)).toBe('23C')
    expect(indoorEquipmentCode('1WAY 카세트', 7200)).toBe('72C')
    expect(indoorEquipmentCode('2WAY 카세트', 5200)).toBe('52G')
    expect(indoorEquipmentCode('2WAY 카세트', 6000)).toBe('60G')
    expect(indoorEquipmentCode('4WAY 카세트', 4000)).toBe('40T')
    expect(indoorEquipmentCode('4WAY 카세트', 8300)).toBe('83T')
    expect(indoorEquipmentCode('4WAY 카세트', 10000)).toBe('100T')
    expect(indoorEquipmentCode('4WAY 카세트', 14500)).toBe('145T')
  })

  it('듀얼베인은 앞의 WAY 수를 따른다', () => {
    expect(indoorEquipmentCode('4WAY 카세트(듀얼베인)', 3200)).toBe('32T')
    expect(indoorEquipmentCode('1WAY 카세트(듀얼베인)', 1200)).toBe('12C')
  })

  it('스탠드형은 P다', () => {
    expect(indoorEquipmentCode('스탠드형', 14500)).toBe('145P')
  })

  // 회의록이 규칙을 준 유형은 넷뿐이다. 나머지는 지어내지 않는다(CLAUDE.md §8).
  it('규칙이 없는 유형은 null이다 — 임의로 만들지 않는다', () => {
    for (const t of ['천장형', '천장형 카세트', '상업용 천장형', '덕트(고정압)', '덕트형', '벽걸이형', '원형 카세트(노출)', '바닥상치형', '기타 실내기', 'DOAS(외기처리 공조기)']) {
      expect(indoorEquipmentCode(t, 5200)).toBeNull()
    }
  })

  it('냉방용량이 없으면 null이다', () => {
    expect(indoorEquipmentCode('4WAY 카세트', null)).toBeNull()
    expect(indoorEquipmentCode('4WAY 카세트', 0)).toBeNull()
    expect(indoorEquipmentCode('4WAY 카세트', -100)).toBeNull()
  })

  it('100W 단위로 반올림한다', () => {
    expect(indoorEquipmentCode('4WAY 카세트', 5249)).toBe('52T')
    expect(indoorEquipmentCode('4WAY 카세트', 5250)).toBe('53T')
  })

  it('반올림 결과가 0이면 null이다 — 장비번호가 될 수 없다', () => {
    expect(indoorEquipmentCode('4WAY 카세트', 40)).toBeNull()
  })

  it('유형 문자는 회의록 4종뿐이다', () => {
    expect(Object.values(EQUIPMENT_CODE_LETTERS).sort()).toEqual(['C', 'G', 'P', 'T'])
  })
})

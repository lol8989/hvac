// Room 엔티티 테스트 — 층·실명·면적·용도·단위부하(Adjustable) 실 단위.
// TDD: 생성 검증 → 기본 단위부하 → 필요부하량 → 오버라이드 → 불변 갱신 → freeze.

import { describe, it, expect } from 'vitest'
import { Room } from './Room'
import { UnitLoad, unitLoadForUsage, KCAL_TO_W } from '../shared/UnitLoad'

const baseProps = {
  id: 'room-1',
  floor: '지상1층',
  name: '시청각실101',
  areaM2: 20,
  usage: '시청각실',
  facility: 'OFFICE' as const,
  shortSideM: 4.5,
  longSideM: 6.0,
}

describe('Room', () => {
  describe('생성 검증', () => {
    it('정상 props로 생성하면 각 필드를 그대로 가진다', () => {
      const r = Room.create(baseProps)
      expect(r.id).toBe('room-1')
      expect(r.floor).toBe('지상1층')
      expect(r.name).toBe('시청각실101')
      expect(r.areaM2).toBe(20)
      expect(r.usage).toBe('시청각실')
    })

    it('id가 빈 문자열이면 throw한다', () => {
      expect(() => Room.create({ ...baseProps, id: '' })).toThrow()
    })

    it('floor가 빈 문자열이면 throw한다', () => {
      expect(() => Room.create({ ...baseProps, floor: '' })).toThrow()
    })

    it('name(실명)이 빈 문자열이면 throw한다', () => {
      expect(() => Room.create({ ...baseProps, name: '' })).toThrow()
    })

    it('areaM2가 0이면 throw한다', () => {
      expect(() => Room.create({ ...baseProps, areaM2: 0 })).toThrow()
    })

    it('areaM2가 음수이면 throw한다', () => {
      expect(() => Room.create({ ...baseProps, areaM2: -5 })).toThrow()
    })

    it('areaM2가 유한수가 아니면(NaN/Infinity) throw한다', () => {
      expect(() => Room.create({ ...baseProps, areaM2: NaN })).toThrow()
      expect(() => Room.create({ ...baseProps, areaM2: Infinity })).toThrow()
    })
  })

  describe('usage 기반 기본 단위부하', () => {
    it('aiUnitLoad를 생략하면 unitLoadForUsage(usage)가 AI 기본값이 된다', () => {
      const r = Room.create(baseProps)
      expect(r.effectiveUnitLoad.equals(unitLoadForUsage('OFFICE', '시청각실'))).toBe(true)
      expect(r.isUnitLoadOverridden).toBe(false)
    })

    it('aiUnitLoad를 지정하면 그 값이 AI 기본값이 된다', () => {
      const custom = new UnitLoad(200, 210)
      const r = Room.create({ ...baseProps, aiUnitLoad: custom })
      expect(r.effectiveUnitLoad.equals(custom)).toBe(true)
    })
  })

  describe('requiredLoadW', () => {
    // 시청각실은 LG 단위부하표에 없는 실명 → 기본값 150kcal/h·㎡.
    it('20㎡ 시청각실(표에 없어 기본 150kcal)이면 필요부하량이 약 3489W이다', () => {
      const r = Room.create(baseProps)
      // 150 × 1.163 × 20 = 3489.0
      expect(r.requiredLoadW.cool).toBeCloseTo(3489.0, 1)
      expect(r.requiredLoadW.heat).toBeCloseTo(3489.0, 1)
    })

    it('단위부하를 오버라이드하면 필요부하량이 오버라이드 값 기준으로 계산된다', () => {
      const r = Room.create(baseProps).overrideUnitLoad(new UnitLoad(200, 180))
      expect(r.requiredLoadW.cool).toBeCloseTo(200 * KCAL_TO_W * 20, 6)
      expect(r.requiredLoadW.heat).toBeCloseTo(180 * KCAL_TO_W * 20, 6)
    })
  })

  describe('overrideUnitLoad / clearUnitLoadOverride', () => {
    it('오버라이드하면 isUnitLoadOverridden이 true가 된다', () => {
      const r = Room.create(baseProps).overrideUnitLoad(new UnitLoad(200, 200))
      expect(r.isUnitLoadOverridden).toBe(true)
    })

    it('오버라이드를 해제하면 AI 기본값으로 돌아간다', () => {
      const r = Room.create(baseProps)
        .overrideUnitLoad(new UnitLoad(200, 200))
        .clearUnitLoadOverride()
      expect(r.isUnitLoadOverridden).toBe(false)
      expect(r.effectiveUnitLoad.equals(unitLoadForUsage('OFFICE', '시청각실'))).toBe(true)
    })
  })

  describe('withUsage', () => {
    it('용도를 변경하면 AI 단위부하가 새 용도 기본값으로 갱신된다', () => {
      const r = Room.create(baseProps).withUsage('사무실')
      expect(r.usage).toBe('사무실')
      expect(r.effectiveUnitLoad.equals(unitLoadForUsage('OFFICE', '사무실'))).toBe(true)
    })

    it('용도를 변경해도 user 오버라이드는 보존된다(withAi 정책)', () => {
      const override = new UnitLoad(200, 200)
      const r = Room.create(baseProps).overrideUnitLoad(override).withUsage('사무실')
      expect(r.isUnitLoadOverridden).toBe(true)
      expect(r.effectiveUnitLoad.equals(override)).toBe(true)
      // 오버라이드 해제 시 새 용도(사무실) AI 기본값이 드러난다
      expect(r.clearUnitLoadOverride().effectiveUnitLoad.equals(unitLoadForUsage('OFFICE', '사무실'))).toBe(true)
    })
  })

  describe('불변 갱신', () => {
    it('rename하면 새 인스턴스가 반환되고 원본은 유지된다', () => {
      const r = Room.create(baseProps)
      const renamed = r.rename('회의실A')
      expect(renamed).not.toBe(r)
      expect(renamed.name).toBe('회의실A')
      expect(r.name).toBe('시청각실101')
    })

    it('rename에 빈 문자열을 주면 throw한다', () => {
      expect(() => Room.create(baseProps).rename('')).toThrow()
    })

    it('withArea하면 새 인스턴스가 반환되고 원본은 유지된다', () => {
      const r = Room.create(baseProps)
      const resized = r.withArea(35)
      expect(resized).not.toBe(r)
      expect(resized.areaM2).toBe(35)
      expect(r.areaM2).toBe(20)
    })

    it('withArea에 0 이하 면적을 주면 throw한다', () => {
      expect(() => Room.create(baseProps).withArea(0)).toThrow()
      expect(() => Room.create(baseProps).withArea(-1)).toThrow()
    })
  })

  describe('equals', () => {
    it('id가 같으면 다른 속성이 달라도 같다고 판정한다', () => {
      const a = Room.create(baseProps)
      const b = a.rename('다른이름').withArea(99)
      expect(a.equals(b)).toBe(true)
    })

    it('id가 다르면 다르다고 판정한다', () => {
      const a = Room.create(baseProps)
      const b = Room.create({ ...baseProps, id: 'room-2' })
      expect(a.equals(b)).toBe(false)
    })
  })

  describe('불변성(freeze)', () => {
    it('인스턴스는 frozen이라 속성 변경 시도가 무시되거나 throw한다', () => {
      const r = Room.create(baseProps)
      expect(Object.isFrozen(r)).toBe(true)
      expect(() => {
        ;(r as { name: string }).name = '변조'
      }).toThrow()
      expect(r.name).toBe('시청각실101')
    })
  })

  // 실내기 타입 결정(짧은 폭 경계)과 확산범위 대수 계산이 실측 치수를 요구한다.
  describe('실측 치수(m)', () => {
    it('짧은 변·긴 변을 뒤집어 넣어도 정규화된다', () => {
      const r = Room.create({ ...baseProps, shortSideM: 6.0, longSideM: 4.5 })
      expect(r.shortSideM).toBe(4.5)
      expect(r.longSideM).toBe(6.0)
    })

    it('변 길이가 0 이하면 throw한다', () => {
      expect(() => Room.create({ ...baseProps, shortSideM: 0 })).toThrow()
      expect(() => Room.create({ ...baseProps, longSideM: -1 })).toThrow()
    })

    it('shape은 타입 결정에 필요한 형상·부하를 함께 담는다', () => {
      const r = Room.create(baseProps)
      expect(r.shape).toEqual({
        shortSideM: 4.5,
        longSideM: 6.0,
        residential: false,
        corridor: false,
      })
    })

    // 단위세대(주거시설)는 무조건 1WAY — 시설군에서 파생한다
    it('주거시설이면 residential이다', () => {
      expect(Room.create({ ...baseProps, facility: '주거시설' }).shape.residential).toBe(true)
    })

    // 복도는 '4kW 이상 4WAY 기본' 규칙에서 빠진다 — 용도에서 파생한다
    it('용도가 복도면 corridor다', () => {
      expect(Room.create({ ...baseProps, usage: '복도' }).shape.corridor).toBe(true)
      expect(Room.create({ ...baseProps, usage: '중앙복도' }).shape.corridor).toBe(true)
    })

    it('면적 변경은 치수를 보존한다', () => {
      const r = Room.create(baseProps).withArea(30)
      expect(r.shortSideM).toBe(4.5)
      expect(r.longSideM).toBe(6.0)
    })
  })
})

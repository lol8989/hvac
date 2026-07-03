import { describe, it, expect } from 'vitest'
import { AssignmentPlan } from './AssignmentPlan.js'
import { OutdoorGroup } from './OutdoorGroup.js'
import { OutdoorUnit } from './OutdoorUnit.js'
import { IndoorUnit } from './IndoorUnit.js'
import { AssignmentRejected, NotFoundError } from './errors.js'

// ── 픽스처 ──
const odu = (over = {}) =>
  new OutdoorUnit({ model: 'RPUW12BX9M', category: '냉난방 절환형', sys: 'EHP', capacityKw: 34.8, maxConnections: 4, ...over })
const idu = (id, coolKw, sys = 'EHP') => new IndoorUnit({ id, roomName: id, coolKw, sys })
const grp = (key, indoorUnits = [], over = {}) =>
  new OutdoorGroup({ key, label: key, outdoorUnit: odu(over), indoorUnits })

// 기본 플랜: ODU1(EHP)에 AC_001, ODU2(GHP)는 비어있음, 풀에 AC_002(EHP)
const basePlan = () =>
  new AssignmentPlan({
    groups: [
      grp('ODU1', [idu('AC_001', 11.2, 'EHP')]),
      grp('ODU2', [], { sys: 'GHP', model: 'GPUW280C2S', category: 'GHP', capacityKw: 28.0 }),
    ],
    pool: [idu('AC_002', 5.6, 'EHP')],
  })

describe('AssignmentPlan (그룹↔풀 조율자, 교차 불변식)', () => {
  it('그룹과 풀을 방어적 복사본으로 노출한다', () => {
    const p = basePlan()
    p.groups.push(grp('ODUX'))
    p.pool.push(idu('AC_099', 1))
    expect(p.groups).toHaveLength(2)
    expect(p.pool).toHaveLength(1)
  })

  it('locationOf / indoorById / groupByKey 조회', () => {
    const p = basePlan()
    expect(p.locationOf('AC_001')).toBe('ODU1')
    expect(p.locationOf('AC_002')).toBe('pool')
    expect(p.locationOf('없음')).toBe(null)
    expect(p.indoorById('AC_001').roomName).toBe('AC_001')
    expect(p.groupByKey('ODU2').label).toBe('ODU2')
  })

  it('[적대] 같은 실내기가 두 위치에 있으면 생성할 수 없다', () => {
    expect(
      () =>
        new AssignmentPlan({
          groups: [grp('ODU1', [idu('AC_001', 11.2)])],
          pool: [idu('AC_001', 11.2)],
        }),
    ).toThrow()
  })

  describe('reassign — 실내기 이동', () => {
    it('풀→그룹(같은 계열)으로 이동하면 정확히 한 곳에만 존재한다', () => {
      const p = basePlan().reassign('AC_002', 'ODU1')
      expect(p.locationOf('AC_002')).toBe('ODU1')
      expect(p.groupByKey('ODU1').indoorUnits.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_002'])
      expect(p.pool).toHaveLength(0)
    })

    it('그룹→풀로 이동한다', () => {
      const p = basePlan().reassign('AC_001', 'pool')
      expect(p.locationOf('AC_001')).toBe('pool')
      expect(p.groupByKey('ODU1').indoorUnits).toHaveLength(0)
    })

    it('원본 플랜은 불변이다(immutable)', () => {
      const p0 = basePlan()
      p0.reassign('AC_002', 'ODU1')
      expect(p0.locationOf('AC_002')).toBe('pool')
    })

    it('[적대] 계열이 다른 그룹으로 이동하면 거부하고(AssignmentRejected) 원본은 그대로', () => {
      const p0 = basePlan()
      expect(() => p0.reassign('AC_002', 'ODU2')).toThrow(AssignmentRejected) // EHP→GHP
      expect(p0.locationOf('AC_002')).toBe('pool')
    })

    it('[적대] 없는 실내기/없는 그룹으로 이동하면 NotFoundError', () => {
      expect(() => basePlan().reassign('없음', 'ODU1')).toThrow(NotFoundError)
      expect(() => basePlan().reassign('AC_002', '없음')).toThrow(NotFoundError)
    })

    it('이동 후에도 전체 실내기 집합은 보존된다(유실·중복 없음)', () => {
      const p = basePlan().reassign('AC_002', 'ODU1')
      const all = [...p.groups.flatMap((g) => g.indoorUnits), ...p.pool].map((i) => i.id).sort()
      expect(all).toEqual(['AC_001', 'AC_002'])
    })
  })

  describe('그룹 명령', () => {
    it('replaceModel: 계열 변경 시 미호환 실내기가 풀로 방출된다', () => {
      const { plan, ejected } = basePlan().replaceModel('ODU1', odu({ sys: 'GHP', model: 'GPUW450C2S', category: 'GHP', capacityKw: 45.0 }))
      expect(ejected.map((i) => i.id)).toEqual(['AC_001'])
      expect(plan.locationOf('AC_001')).toBe('pool')
      expect(plan.groupByKey('ODU1').indoorUnits).toHaveLength(0)
    })

    it('removeGroup: 그룹이 제거되고 연결 실내기는 풀로 반환된다', () => {
      const { plan, released } = basePlan().removeGroup('ODU1')
      expect(released.map((i) => i.id)).toEqual(['AC_001'])
      expect(plan.groupByKey('ODU1')).toBeUndefined()
      expect(plan.locationOf('AC_001')).toBe('pool')
    })

    it('addGroup: 빈 실외기 그룹을 추가한다', () => {
      const plan = basePlan().addGroup({ meta: { key: 'ODU3', label: '실외기-3' }, outdoorUnit: odu() })
      expect(plan.groupByKey('ODU3').indoorUnits).toHaveLength(0)
      expect(plan.groups).toHaveLength(3)
    })

    it('split: 그룹을 분할해 새 그룹을 추가하고 실내기 집합을 보존한다', () => {
      const p0 = new AssignmentPlan({
        groups: [grp('ODU1', [idu('AC_001', 5), idu('AC_003', 5), idu('AC_004', 5), idu('AC_006', 5)])],
        pool: [],
      })
      const p = p0.split('ODU1', { key: 'ODU2', label: '실외기-2' })
      expect(p.groups).toHaveLength(2)
      const all = p.groups.flatMap((g) => g.indoorUnits).map((i) => i.id).sort()
      expect(all).toEqual(['AC_001', 'AC_003', 'AC_004', 'AC_006'])
    })

    it('[적대] 없는 그룹 명령은 NotFoundError', () => {
      expect(() => basePlan().removeGroup('없음')).toThrow(NotFoundError)
      expect(() => basePlan().replaceModel('없음', odu())).toThrow(NotFoundError)
      expect(() => basePlan().split('없음', { key: 'X', label: 'x' })).toThrow(NotFoundError)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { AssignmentPlan } from './AssignmentPlan'
import { OutdoorGroup } from './OutdoorGroup'
import { OutdoorUnit } from './OutdoorUnit'
import { IndoorUnit, indoorUnitId } from './IndoorUnit'
import { AssignmentRejected, NotFoundError } from './errors'

// ── 픽스처 ──
const odu = (over = {}) =>
  new OutdoorUnit({ model: 'RPUW12BX9M', category: '냉난방 절환형', sys: 'EHP', capacityKw: 34.8, maxConnections: 4, ...over })
// 실내기 1대. n으로 같은 실의 2대째를 만든다.
const idu = (roomId: string, coolKw: number, sys = 'EHP', n = 1) =>
  new IndoorUnit({ id: indoorUnitId(roomId, n), roomId, roomName: roomId, coolKw, sys })
const grp = (key: string, indoorUnits: IndoorUnit[] = [], over = {}) =>
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

  it('locationOf / indoorById / groupByKey 조회 (유닛 id 기준)', () => {
    const p = basePlan()
    expect(p.locationOf('AC_001#1')).toBe('ODU1')
    expect(p.locationOf('AC_002#1')).toBe('pool')
    expect(p.locationOf('없음')).toBe(null)
    expect(p.indoorById('AC_001#1')!.roomName).toBe('AC_001')
    expect(p.groupByKey('ODU2')!.label).toBe('ODU2')
  })

  it('roomLocationOf / unitsOfRoom 조회 (실 기준)', () => {
    const p = new AssignmentPlan({
      groups: [grp('ODU1', [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2)])],
      pool: [idu('AC_002', 5)],
    })
    expect(p.roomLocationOf('AC_001')).toBe('ODU1')
    expect(p.roomLocationOf('AC_002')).toBe('pool')
    expect(p.roomLocationOf('없음')).toBe(null)
    expect(p.unitsOfRoom('AC_001').map((u) => u.id)).toEqual(['AC_001#1', 'AC_001#2'])
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

  it('[적대] 한 실의 대수가 두 위치로 갈라지면 생성할 수 없다(실 응집 불변식)', () => {
    // 선정표의 실 행은 실외기를 정확히 하나 가리켜야 한다.
    expect(
      () =>
        new AssignmentPlan({
          groups: [grp('ODU1', [idu('AC_001', 5, 'EHP', 1)])],
          pool: [idu('AC_001', 5, 'EHP', 2)],
        }),
    ).toThrow(/AC_001/)
  })

  describe('reassignRoom — 실 단위 이동', () => {
    it('풀→그룹(같은 계열)으로 이동하면 정확히 한 곳에만 존재한다', () => {
      const p = basePlan().reassignRoom('AC_002', 'ODU1')
      expect(p.roomLocationOf('AC_002')).toBe('ODU1')
      expect(p.groupByKey('ODU1')!.indoorUnits.map((i) => i.id).sort()).toEqual(['AC_001#1', 'AC_002#1'])
      expect(p.pool).toHaveLength(0)
    })

    it('한 실의 모든 대수가 함께 움직인다', () => {
      const p0 = new AssignmentPlan({
        groups: [grp('ODU1')],
        pool: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2)],
      })
      const p = p0.reassignRoom('AC_001', 'ODU1')
      expect(p.groupByKey('ODU1')!.indoorUnits).toHaveLength(2)
      expect(p.pool).toHaveLength(0)
    })

    it('그룹→풀로 이동한다', () => {
      const p = basePlan().reassignRoom('AC_001', 'pool')
      expect(p.roomLocationOf('AC_001')).toBe('pool')
      expect(p.groupByKey('ODU1')!.indoorUnits).toHaveLength(0)
    })

    it('같은 곳으로의 이동은 무해하다(멱등)', () => {
      const p = basePlan().reassignRoom('AC_001', 'ODU1')
      expect(p.groupByKey('ODU1')!.indoorUnits).toHaveLength(1)
    })

    it('원본 플랜은 불변이다(immutable)', () => {
      const p0 = basePlan()
      p0.reassignRoom('AC_002', 'ODU1')
      expect(p0.roomLocationOf('AC_002')).toBe('pool')
    })

    it('[적대] 계열이 다른 그룹으로 이동하면 거부하고(AssignmentRejected) 원본은 그대로', () => {
      const p0 = basePlan()
      expect(() => p0.reassignRoom('AC_002', 'ODU2')).toThrow(AssignmentRejected) // EHP→GHP
      expect(p0.roomLocationOf('AC_002')).toBe('pool')
    })

    it('[적대] 최대 연결 대수를 넘기면 거부하고 한 대도 옮기지 않는다', () => {
      const p0 = new AssignmentPlan({
        groups: [grp('ODU1', [idu('AC_000', 5)], { maxConnections: 2 })],
        pool: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2)],
      })
      expect(() => p0.reassignRoom('AC_001', 'ODU1')).toThrow(AssignmentRejected)
      expect(p0.roomLocationOf('AC_001')).toBe('pool')
    })

    it('[적대] 없는 실/없는 그룹으로 이동하면 NotFoundError', () => {
      expect(() => basePlan().reassignRoom('없음', 'ODU1')).toThrow(NotFoundError)
      expect(() => basePlan().reassignRoom('AC_002', '없음')).toThrow(NotFoundError)
    })

    it('이동 후에도 전체 실내기 집합은 보존된다(유실·중복 없음)', () => {
      const p = basePlan().reassignRoom('AC_002', 'ODU1')
      const all = [...p.groups.flatMap((g) => g.indoorUnits), ...p.pool].map((i) => i.id).sort()
      expect(all).toEqual(['AC_001#1', 'AC_002#1'])
    })
  })

  describe('그룹 명령', () => {
    it('replaceModel: 계열 변경 시 미호환 실내기가 풀로 방출된다', () => {
      const { plan, ejected } = basePlan().replaceModel('ODU1', odu({ sys: 'GHP', model: 'GPUW450C2S', category: 'GHP', capacityKw: 45.0 }))
      expect(ejected.map((i) => i.id)).toEqual(['AC_001#1'])
      expect(plan.roomLocationOf('AC_001')).toBe('pool')
      expect(plan.groupByKey('ODU1')!.indoorUnits).toHaveLength(0)
    })

    it('removeGroup: 그룹이 제거되고 연결 실내기는 풀로 반환된다', () => {
      const { plan, released } = basePlan().removeGroup('ODU1')
      expect(released.map((i) => i.id)).toEqual(['AC_001#1'])
      expect(plan.groupByKey('ODU1')).toBeUndefined()
      expect(plan.roomLocationOf('AC_001')).toBe('pool')
    })

    it('addGroup: 빈 실외기 그룹을 추가한다', () => {
      const plan = basePlan().addGroup({ meta: { key: 'ODU3', label: '실외기-3' }, outdoorUnit: odu() })
      expect(plan.groupByKey('ODU3')!.indoorUnits).toHaveLength(0)
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
      expect(all).toEqual(['AC_001#1', 'AC_003#1', 'AC_004#1', 'AC_006#1'])
    })

    it('[적대] 없는 그룹 명령은 NotFoundError', () => {
      expect(() => basePlan().removeGroup('없음')).toThrow(NotFoundError)
      expect(() => basePlan().replaceModel('없음', odu())).toThrow(NotFoundError)
      expect(() => basePlan().split('없음', { key: 'X', label: 'x' })).toThrow(NotFoundError)
    })
  })

  describe('집계 조회 (단가·등급)', () => {
    const pentry = (krw: number, typeCode = 'CONSUMER') => ({
      priceTypeCode: typeCode,
      priceKrw: krw,
      priceWithVatKrw: null,
      effectiveStartDate: '2026-04-20',
      priority: 10,
    })

    it('totalOutdoorPrice(activeOnly)는 활성 그룹 실외기 단가 합을 반환한다', () => {
      const plan = new AssignmentPlan({
        groups: [
          grp('ODU1', [idu('AC_001', 11.2)], { priceEntries: [pentry(4120000)], efficiencyGradeId: 1 }),
          grp('ODU2', [idu('AC_004', 14)], { priceEntries: [pentry(6350000)], efficiencyGradeId: 3 }),
          grp('ODU3', [], { priceEntries: [pentry(8900000)], efficiencyGradeId: 4 }), // 빈 그룹=비활성
        ],
        pool: [],
      })
      const { sum, unknownCount } = plan.totalOutdoorPrice({ activeOnly: true })
      expect(sum.krw).toBe(10470000) // 4.12M + 6.35M (ODU3 제외)
      expect(unknownCount).toBe(0)
    })

    it('단가 미보유 실외기는 unknownCount로 계상하고 부분합을 낸다', () => {
      const plan = new AssignmentPlan({
        groups: [grp('ODU1', [idu('AC_001', 5)], { priceEntries: [pentry(4120000)] }), grp('ODU2', [idu('AC_002', 5)])],
        pool: [],
      })
      const { sum, unknownCount } = plan.totalOutdoorPrice({ activeOnly: true })
      expect(sum.krw).toBe(4120000)
      expect(unknownCount).toBe(1)
    })

    it('그룹이 없으면 sum=0원, unknownCount=0', () => {
      const { sum, unknownCount } = new AssignmentPlan({ groups: [], pool: [] }).totalOutdoorPrice()
      expect(sum.krw).toBe(0)
      expect(unknownCount).toBe(0)
    })

    it('[적대] 서로 다른 단가 유형이 섞이면 예외(혼합 합산 차단)', () => {
      const plan = new AssignmentPlan({
        groups: [
          grp('ODU1', [idu('AC_001', 5)], { priceEntries: [pentry(4120000, 'CONSUMER')] }),
          grp('ODU2', [idu('AC_002', 5)], { priceEntries: [pentry(3000000, 'SUPPLY')] }),
        ],
        pool: [],
      })
      expect(() => plan.totalOutdoorPrice({ activeOnly: true })).toThrow()
    })

    it('gradeDistribution은 등급별 대수와 미상을 반환한다', () => {
      const plan = new AssignmentPlan({
        groups: [
          grp('ODU1', [idu('AC_001', 5)], { efficiencyGradeId: 1 }),
          grp('ODU2', [idu('AC_002', 5)], { efficiencyGradeId: 1 }),
          grp('ODU3', [idu('AC_003', 5)], { efficiencyGradeId: 3 }),
          grp('ODU4', [idu('AC_004', 5)]), // 등급 미상
        ],
        pool: [],
      })
      const { byGrade, unknown } = plan.gradeDistribution({ activeOnly: true })
      expect(byGrade.get(1)).toBe(2)
      expect(byGrade.get(3)).toBe(1)
      expect(unknown).toBe(1)
    })
  })
})

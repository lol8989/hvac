import { describe, it, expect } from 'vitest'
import { bootstrapPlan, toViewModel, outdoorUnitFromSpec, nextGroupMeta, specGradeText, syncPlanUnits, selectOutdoorPlan, indoorUnitsFor } from './planAdapter'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import { IndoorUnit, indoorUnitId } from '../../domain/generation/IndoorUnit'
import { NoCompatibleOutdoorError } from '../../domain/generation/errors'
import type { OutdoorModelSpec } from '../../application/generation/ports'
import { InMemoryOutdoorModelCatalog } from '../../infrastructure/generation/InMemoryOutdoorModelCatalog'
import { ROOMS } from '../../data'
import { ComboRange } from '../../domain/shared/ComboRange'

describe('planAdapter (목업 ↔ 도메인/뷰모델 어댑터, 장비마스터 스펙 주입)', () => {
  const catalog = new InMemoryOutdoorModelCatalog()
  const FLOOR = '지상1층'
  const floorOf = () => FLOOR

  // 목업 실을 실내기 유닛으로: 4kW짜리 EHP 실내기 quantity대.
  const unitsOf = (roomId: string, quantity = 1, coolW = 4000, energySource: 'EHP' | 'GHP' = 'EHP') =>
    indoorUnitsFor({ id: roomId, name: ROOMS[roomId]?.name ?? roomId }, quantity, { coolW, energySource })

  // 실외기 1대(RPUW08BX9E · 22.4kW · maxConn 13)짜리 빈 그룹 플랜 — syncPlanUnits 검증용 토대.
  const emptyGroupPlan = () =>
    new AssignmentPlan({
      groups: [new OutdoorGroup({ key: 'ODU1', label: '실외기-1', outdoorUnit: outdoorUnitFromSpec(catalog.findByModel('RPUW08BX9E')!) })],
      pool: [],
    })

  it('bootstrapPlan은 완전히 빈 플랜이다 — 실외기는 상수가 아니라 선정 결과다', () => {
    const plan = bootstrapPlan()
    expect(plan).toBeInstanceOf(AssignmentPlan)
    expect(plan.groups).toEqual([])
    expect(plan.pool).toEqual([])
  })

  it('toViewModel의 조합비는 도메인 comboRatio(설치 정격용량 합)에서 온다', () => {
    // ODU1 = RPUW08BX9E, 22.4kW. 실내기 5.6kW 2대 = 11.2kW → 0.50
    const plan = syncPlanUnits(emptyGroupPlan(), unitsOf('AC_001', 2, 5600)).reassignRoom('AC_001', 'ODU1')
    const g1 = toViewModel(plan).groups.find((g) => g.key === 'ODU1')!
    expect(g1.cool).toBe(22.4)
    expect(g1.unitCount).toBe(2) // 실은 1곳인데 대수는 2
    expect(g1.items).toEqual(['AC_001'])
    expect(g1.ratio).toBeCloseTo(0.5, 6)
    expect(g1.judgement).toBe('OK') // 경계 0.50은 OK
  })

  it('toViewModel은 그룹의 등급·효율 표시 문자열을 채운다', () => {
    const plan = emptyGroupPlan()
    const g1 = toViewModel(plan).groups[0]
    expect(g1).toMatchObject({ key: 'ODU1', model: 'RPUW08BX9E', cat: '냉난방 절환형', sys: 'EHP', cool: 22.4 })
    expect(g1.items).toEqual([])
    expect(g1.unitCount).toBe(0)
    expect(g1.gradeText).toBe('2등급')
    expect(g1.effText).toBe('EERa 5.10') // EHP는 전기식 EER
  })

  it('outdoorUnitFromSpec은 마스터 스펙을 OutdoorUnit VO로 변환하고 maxConnections를 주입한다', () => {
    const spec = catalog.findByModel('GPUW280C2S')!
    const odu = outdoorUnitFromSpec(spec)
    expect(odu).toBeInstanceOf(OutdoorUnit)
    expect(odu.model.value).toBe('GPUW280C2S')
    expect(odu.energySource.code).toBe('GHP')
    expect(odu.capacity.kw).toBe(82.0)
    expect(odu.maxConnections).toBe(spec.maxConnections)
  })

  it('계열별 효율 지표 라벨을 구분한다 — GHP는 EERa가 아닌 COPc로 표기', () => {
    const ghp = new AssignmentPlan({
      groups: [new OutdoorGroup({ key: 'ODU1', label: '실외기-1', outdoorUnit: outdoorUnitFromSpec(catalog.findByModel('GPUW280C2S')!) })],
    })
    const g = toViewModel(ghp).groups[0]
    expect(g.sys).toBe('GHP')
    expect(g.effText).toBe('COPc 1.55')
    expect(g.effText?.startsWith('EERa')).toBe(false)
  })

  it('specGradeText는 스펙에서 표시 문자열을 만든다', () => {
    const spec = catalog.findByModel('RPUW20BX9P')!
    expect(specGradeText(spec)).toBe('3등급')
  })


  it('outdoorUnitFromSpec은 스펙의 comboRange를 OutdoorUnit에 전달한다', () => {
    const range = new ComboRange(0.32, 1.0) // 예: DOAS 하한 완화 정책
    const spec: OutdoorModelSpec = { model: 'TESTCOMBO', category: '테스트', energySource: 'EHP', capacityKw: 30, maxConnections: 10, heatKw: null, hp: 10, comboRange: range }
    expect(outdoorUnitFromSpec(spec).comboRange.equals(range)).toBe(true)
    // 카탈로그 목업은 정책 미지정 → 기본 범위가 전달된다
    const fromCatalog = outdoorUnitFromSpec(catalog.findByModel('RPUW08BX9E')!)
    expect(fromCatalog.comboRange.equals(ComboRange.DEFAULT)).toBe(true)
  })

  it('[통합] 주입된 maxConnections가 OutdoorGroup의 MAX_CONNECTIONS 불변식을 구동한다', () => {
    const spec: OutdoorModelSpec = { model: 'TESTMAX2', category: '테스트', energySource: 'EHP', capacityKw: 30, maxConnections: 2, heatKw: null, hp: 10, comboRange: ComboRange.DEFAULT }
    const idu = (id: string) => new IndoorUnit({ id: indoorUnitId(id, 1), roomId: id, roomName: id, coolKw: 5, sys: 'EHP' })
    const g = new OutdoorGroup({ key: 'ODU9', label: 't', outdoorUnit: outdoorUnitFromSpec(spec) })
      .assign(idu('A'))
      .assign(idu('B'))
    // 스펙상 최대 2대 → 3번째 배정은 거부된다
    expect(g.canAssign(idu('C'))).toMatchObject({ ok: false, reason: 'MAX_CONNECTIONS' })
  })

  describe('indoorUnitsFor (실 + 대수 + 모델 → 실내기 유닛)', () => {
    it('대수만큼 유닛을 만들고 정격용량을 싣는다', () => {
      const units = indoorUnitsFor({ id: 'AC_001', name: '거실' }, 2, { coolW: 5600, energySource: 'EHP' })
      expect(units.map((u) => u.id)).toEqual(['AC_001#1', 'AC_001#2'])
      expect(units.every((u) => u.roomId === 'AC_001' && u.roomName === '거실')).toBe(true)
      expect(units[0].cool.kw).toBeCloseTo(5.6, 6) // 설계부하가 아니라 모델 정격
    })

    it('대수 0이면 빈 배열', () => {
      expect(indoorUnitsFor({ id: 'AC_001', name: '거실' }, 0, { coolW: 5600, energySource: 'EHP' })).toEqual([])
    })
  })

  it('nextGroupMeta는 기존 키 다음 번호의 그룹 메타를 만든다', () => {
    expect(nextGroupMeta(bootstrapPlan())).toEqual({ key: 'ODU1', label: '실외기-1' })
    expect(nextGroupMeta(emptyGroupPlan())).toEqual({ key: 'ODU2', label: '실외기-2' })
  })

  describe('syncPlanUnits (실내기 배치 = SSOT, 플랜이 따라간다)', () => {
    const allUnits = (rooms: string[], q = 1) => rooms.flatMap((r) => unitsOf(r, q))

    it('플랜에 없던 실을 미배정 풀에 유닛으로 추가한다', () => {
      const next = syncPlanUnits(emptyGroupPlan(), allUnits(['AC_001', 'AC_002']))
      expect(next.pool.map((i) => i.id).sort()).toEqual(['AC_001#1', 'AC_002#1'])
      for (const g of next.groups) expect(g.indoorUnits).toEqual([])
    })

    it('이미 배정된 실은 그 그룹에 남는다', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), allUnits(['AC_001'])).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, allUnits(['AC_001', 'AC_003']))
      expect(next.roomLocationOf('AC_001')).toBe('ODU1')
      expect(next.roomLocationOf('AC_003')).toBe('pool')
    })

    it('대수가 늘어도 여유가 있으면 같은 그룹에 남는다(선정표 대수 편집)', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), unitsOf('AC_001', 1)).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, unitsOf('AC_001', 2))
      expect(next.roomLocationOf('AC_001')).toBe('ODU1')
      expect(next.groupByKey('ODU1')!.indoorUnits).toHaveLength(2)
    })

    it('대수가 줄어도 같은 그룹에 남는다(도면에서 1대 삭제)', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), unitsOf('AC_001', 3)).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, unitsOf('AC_001', 1))
      expect(next.roomLocationOf('AC_001')).toBe('ODU1')
      expect(next.groupByKey('ODU1')!.indoorUnits.map((u) => u.id)).toEqual(['AC_001#1'])
    })

    it('[적대] 대수가 늘어 최대 연결 대수를 넘기면 그 실은 풀로 방출된다', () => {
      const plan0 = emptyGroupPlan()
      const maxConn = plan0.groupByKey('ODU1')!.outdoorUnit.maxConnections
      const seeded = syncPlanUnits(plan0, unitsOf('AC_001', 1)).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, unitsOf('AC_001', maxConn + 1))
      expect(next.roomLocationOf('AC_001')).toBe('pool')
      expect(next.groupByKey('ODU1')!.indoorUnits).toEqual([])
    })

    it('[적대] 배치에서 사라진 실은 플랜에서도 사라진다(도면에서 지운 실내기)', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), allUnits(['AC_001', 'AC_003'])).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, allUnits(['AC_003']))
      expect(next.roomLocationOf('AC_001')).toBe(null)
      expect(next.groupByKey('ODU1')!.indoorUnits).toEqual([])
    })

    it('[적대] 모델이 바뀌어 정격이 달라지면 배정을 유지한 채 용량만 갱신된다', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), unitsOf('AC_001', 1, 4000)).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, unitsOf('AC_001', 1, 9000))
      expect(next.roomLocationOf('AC_001')).toBe('ODU1')
      expect(next.groupByKey('ODU1')!.indoorUnits[0].cool.kw).toBeCloseTo(9.0, 6)
    })

    it('[적대] 계열이 바뀌면 그 실은 풀로 방출된다', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), unitsOf('AC_001', 1, 4000, 'EHP')).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, unitsOf('AC_001', 1, 4000, 'GHP'))
      expect(next.roomLocationOf('AC_001')).toBe('pool')
    })

    it('[적대] 빈 배치는 플랜을 비운다', () => {
      const seeded = syncPlanUnits(emptyGroupPlan(), allUnits(['AC_001'])).reassignRoom('AC_001', 'ODU1')
      const next = syncPlanUnits(seeded, [])
      expect(next.pool).toEqual([])
      for (const g of next.groups) expect(g.indoorUnits).toEqual([])
    })
  })

  describe('selectOutdoorPlan (배치된 실내기 → 실외기 선정·조합)', () => {
    it('선정 결과를 그룹으로 만들고 미배정을 남기지 않는다', () => {
      // 4kW 실내기 4대(합 16kW) → 22.4kW짜리 RPUW08BX9E가 최소 용량(0.71)
      const units = ['AC_001', 'AC_002', 'AC_003', 'AC_004'].flatMap((r) => unitsOf(r, 1))
      const plan = selectOutdoorPlan(units, floorOf, catalog)

      expect(plan.pool).toEqual([])
      expect(plan.groups).toHaveLength(1)
      const g = plan.groups[0]
      expect(g.key).toBe('ODU1')
      expect(g.outdoorUnit.model.value).toBe('RPUW08BX9E')
      expect(g.roomIds.sort()).toEqual(['AC_001', 'AC_002', 'AC_003', 'AC_004'])
    })

    it('실외기 대수·모델은 상수가 아니라 정격 총용량이 정한다', () => {
      const small = selectOutdoorPlan(unitsOf('AC_001', 1, 9000), floorOf, catalog) // 9kW
      const big = selectOutdoorPlan(unitsOf('AC_001', 4, 9000), floorOf, catalog) // 36kW
      expect(small.groups[0].outdoorUnit.model.value).not.toBe(big.groups[0].outdoorUnit.model.value)
      expect(small.groups[0].outdoorUnit.capacity.kw).toBeLessThan(big.groups[0].outdoorUnit.capacity.kw)
    })

    it('난방 가능한 실외기만 고른다 — 냉방전용(RPUQ141X9S)은 뽑히지 않는다', () => {
      // 정격 37.6kW: 냉방전용 39.2kW가 '최소 용량'이지만 배제되고 46.4kW 절환형이 뽑힌다.
      const units = unitsOf('AC_001', 4, 9400)
      const plan = selectOutdoorPlan(units, floorOf, catalog)
      const model = plan.groups[0].outdoorUnit.model.value
      expect(model).not.toBe('RPUQ141X9S')
      expect(catalog.findByModel(model)!.heatKw).not.toBeNull()
    })

    it('실내기가 없으면 빈 플랜', () => {
      const plan = selectOutdoorPlan([], floorOf, catalog)
      expect(plan.groups).toEqual([])
      expect(plan.pool).toEqual([])
    })

    it('[적대] 계열에 맞는 게시 실외기가 없으면 도메인 에러가 그대로 올라온다', () => {
      const awhp = indoorUnitsFor({ id: 'AC_001', name: '거실' }, 1, { coolW: 4000, energySource: 'AWHP' })
      expect(() => selectOutdoorPlan(awhp, floorOf, catalog)).toThrow(NoCompatibleOutdoorError)
    })
  })
})

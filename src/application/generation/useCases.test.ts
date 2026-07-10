import { describe, it, expect, beforeEach } from 'vitest'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { IndoorUnit, indoorUnitId } from '../../domain/generation/IndoorUnit'
import { NotFoundError } from '../../domain/generation/errors'
import { InMemoryPlanRepository } from '../../infrastructure/generation/InMemoryPlanRepository'
import { makeReassignRoom } from './ReassignRoom'
import { makeReplaceOutdoorModel } from './ReplaceOutdoorModel'
import { makeAddGroup, makeRemoveGroup, makeSplitGroup } from './GroupCommands'

const odu = (over = {}) =>
  new OutdoorUnit({ model: 'RPUW12BX9M', category: '냉난방 절환형', sys: 'EHP', capacityKw: 34.8, maxConnections: 4, ...over })
// 실내기 1대. n으로 같은 실의 2대째를 만든다.
const idu = (roomId: string, coolKw: number, sys = 'EHP', n = 1) =>
  new IndoorUnit({ id: indoorUnitId(roomId, n), roomId, roomName: roomId, coolKw, sys })
const grp = (key: string, indoorUnits: IndoorUnit[] = [], over = {}) =>
  new OutdoorGroup({ key, label: key, outdoorUnit: odu(over), indoorUnits })

const seedPlan = () =>
  new AssignmentPlan({
    groups: [
      grp('ODU1', [idu('AC_001', 11.2, 'EHP')]),
      grp('ODU2', [], { sys: 'GHP', model: 'GPUW280C2S', category: 'GHP', capacityKw: 28.0 }),
    ],
    pool: [idu('AC_002', 5.6, 'EHP')],
  })

describe('Generation 유즈케이스 (application, 포트 DI)', () => {
  let repo: InMemoryPlanRepository
  beforeEach(() => {
    repo = new InMemoryPlanRepository(seedPlan())
  })

  describe('ReassignRoom', () => {
    it('이동에 성공하면 저장하고 이벤트를 반환한다', () => {
      const reassign = makeReassignRoom({ planRepository: repo })
      const res = reassign({ roomId: 'AC_002', to: 'ODU1' })
      if (!res.ok) throw new Error(`reassign 실패: ${res.reason}`)
      expect(res.event).toMatchObject({ type: 'RoomReassigned', roomId: 'AC_002', from: 'pool', to: 'ODU1' })
      // 저장 반영: 다시 로드하면 이동돼 있다
      expect(repo.load().roomLocationOf('AC_002')).toBe('ODU1')
    })

    it('한 실의 2대가 함께 이동한다', () => {
      repo = new InMemoryPlanRepository(
        new AssignmentPlan({ groups: [grp('ODU1')], pool: [idu('AC_007', 5, 'EHP', 1), idu('AC_007', 5, 'EHP', 2)] }),
      )
      const reassign = makeReassignRoom({ planRepository: repo })
      const res = reassign({ roomId: 'AC_007', to: 'ODU1' })
      expect(res.ok).toBe(true)
      expect(repo.load().groupByKey('ODU1')!.indoorUnits).toHaveLength(2)
    })

    it('계열 불일치는 거부 결과를 반환하고 저장하지 않는다', () => {
      const reassign = makeReassignRoom({ planRepository: repo })
      const res = reassign({ roomId: 'AC_002', to: 'ODU2' }) // EHP→GHP
      expect(res).toMatchObject({ ok: false, reason: 'SERIES_MISMATCH' })
      expect(repo.load().roomLocationOf('AC_002')).toBe('pool') // 롤백/미저장
    })

    it('최대 연결 대수 초과는 거부 결과를 반환한다', () => {
      repo = new InMemoryPlanRepository(
        new AssignmentPlan({
          groups: [grp('ODU1', [idu('AC_000', 5)], { maxConnections: 2 })],
          pool: [idu('AC_007', 5, 'EHP', 1), idu('AC_007', 5, 'EHP', 2)],
        }),
      )
      const reassign = makeReassignRoom({ planRepository: repo })
      expect(reassign({ roomId: 'AC_007', to: 'ODU1' })).toMatchObject({ ok: false, reason: 'MAX_CONNECTIONS' })
      expect(repo.load().roomLocationOf('AC_007')).toBe('pool')
    })

    it('[적대] 없는 실은 NotFoundError를 전파한다', () => {
      const reassign = makeReassignRoom({ planRepository: repo })
      expect(() => reassign({ roomId: '없음', to: 'ODU1' })).toThrow(NotFoundError)
    })
  })

  it('ReplaceOutdoorModel: 계열 변경 시 방출 실내기를 풀로 옮기고 이벤트를 낸다', () => {
    const replace = makeReplaceOutdoorModel({ planRepository: repo })
    const res = replace({ key: 'ODU1', outdoorUnit: odu({ sys: 'GHP', model: 'GPUW450C2S', category: 'GHP', capacityKw: 45.0 }) })
    expect(res.ok).toBe(true)
    expect(res.event).toMatchObject({ type: 'OutdoorModelReplaced', key: 'ODU1', ejectedIds: ['AC_001#1'] })
    expect(repo.load().roomLocationOf('AC_001')).toBe('pool')
  })

  it('AddGroup: 빈 그룹을 추가하고 이벤트를 낸다', () => {
    const add = makeAddGroup({ planRepository: repo })
    const res = add({ meta: { key: 'ODU9', label: '실외기-9' }, outdoorUnit: odu() })
    expect(res.event).toMatchObject({ type: 'GroupAdded', key: 'ODU9' })
    expect(repo.load().groupByKey('ODU9')!.indoorUnits).toHaveLength(0)
  })

  it('RemoveGroup: 그룹을 제거하고 실내기를 풀로 반환, 이벤트를 낸다', () => {
    const remove = makeRemoveGroup({ planRepository: repo })
    const res = remove({ key: 'ODU1' })
    expect(res.event).toMatchObject({ type: 'GroupRemoved', key: 'ODU1', releasedIds: ['AC_001#1'] })
    expect(repo.load().groupByKey('ODU1')).toBeUndefined()
    expect(repo.load().roomLocationOf('AC_001')).toBe('pool')
  })

  it('SplitGroup: 그룹을 분할하고 이벤트를 낸다', () => {
    repo = new InMemoryPlanRepository(
      new AssignmentPlan({ groups: [grp('ODU1', [idu('A', 5), idu('B', 5), idu('C', 5), idu('D', 5)])], pool: [] }),
    )
    const split = makeSplitGroup({ planRepository: repo })
    const res = split({ key: 'ODU1', meta: { key: 'ODU2', label: '실외기-2' } })
    expect(res.event).toMatchObject({ type: 'GroupSplit', fromKey: 'ODU1', newKey: 'ODU2' })
    expect(repo.load().groups).toHaveLength(2)
  })

  it('[적대] 없는 그룹 명령은 NotFoundError를 전파한다', () => {
    const remove = makeRemoveGroup({ planRepository: repo })
    expect(() => remove({ key: '없음' })).toThrow(NotFoundError)
  })
})

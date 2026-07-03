import { describe, it, expect, beforeEach } from 'vitest'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan.js'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup.js'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit.js'
import { IndoorUnit } from '../../domain/generation/IndoorUnit.js'
import { NotFoundError } from '../../domain/generation/errors.js'
import { InMemoryPlanRepository } from '../../infrastructure/generation/InMemoryPlanRepository.js'
import { makeReassignIndoorUnit } from './ReassignIndoorUnit.js'
import { makeReplaceOutdoorModel } from './ReplaceOutdoorModel.js'
import { makeAddGroup, makeRemoveGroup, makeSplitGroup } from './GroupCommands.js'

const odu = (over = {}) =>
  new OutdoorUnit({ model: 'RPUW12BX9M', category: '냉난방 절환형', sys: 'EHP', capacityKw: 34.8, maxConnections: 4, ...over })
const idu = (id, coolKw, sys = 'EHP') => new IndoorUnit({ id, roomName: id, coolKw, sys })
const grp = (key, indoorUnits = [], over = {}) => new OutdoorGroup({ key, label: key, outdoorUnit: odu(over), indoorUnits })

const seedPlan = () =>
  new AssignmentPlan({
    groups: [
      grp('ODU1', [idu('AC_001', 11.2, 'EHP')]),
      grp('ODU2', [], { sys: 'GHP', model: 'GPUW280C2S', category: 'GHP', capacityKw: 28.0 }),
    ],
    pool: [idu('AC_002', 5.6, 'EHP')],
  })

describe('Generation 유즈케이스 (application, 포트 DI)', () => {
  let repo
  beforeEach(() => {
    repo = new InMemoryPlanRepository(seedPlan())
  })

  describe('ReassignIndoorUnit', () => {
    it('이동에 성공하면 저장하고 이벤트를 반환한다', () => {
      const reassign = makeReassignIndoorUnit({ planRepository: repo })
      const res = reassign({ indoorId: 'AC_002', to: 'ODU1' })
      expect(res.ok).toBe(true)
      expect(res.event).toMatchObject({ type: 'IndoorUnitReassigned', indoorId: 'AC_002', from: 'pool', to: 'ODU1' })
      // 저장 반영: 다시 로드하면 이동돼 있다
      expect(repo.load().locationOf('AC_002')).toBe('ODU1')
    })

    it('계열 불일치는 거부 결과를 반환하고 저장하지 않는다', () => {
      const reassign = makeReassignIndoorUnit({ planRepository: repo })
      const res = reassign({ indoorId: 'AC_002', to: 'ODU2' }) // EHP→GHP
      expect(res).toMatchObject({ ok: false, reason: 'SERIES_MISMATCH' })
      expect(repo.load().locationOf('AC_002')).toBe('pool') // 롤백/미저장
    })

    it('[적대] 없는 실내기는 NotFoundError를 전파한다', () => {
      const reassign = makeReassignIndoorUnit({ planRepository: repo })
      expect(() => reassign({ indoorId: '없음', to: 'ODU1' })).toThrow(NotFoundError)
    })
  })

  it('ReplaceOutdoorModel: 계열 변경 시 방출 실내기를 풀로 옮기고 이벤트를 낸다', () => {
    const replace = makeReplaceOutdoorModel({ planRepository: repo })
    const res = replace({ key: 'ODU1', outdoorUnit: odu({ sys: 'GHP', model: 'GPUW450C2S', category: 'GHP', capacityKw: 45.0 }) })
    expect(res.ok).toBe(true)
    expect(res.event).toMatchObject({ type: 'OutdoorModelReplaced', key: 'ODU1', ejectedIds: ['AC_001'] })
    expect(repo.load().locationOf('AC_001')).toBe('pool')
  })

  it('AddGroup: 빈 그룹을 추가하고 이벤트를 낸다', () => {
    const add = makeAddGroup({ planRepository: repo })
    const res = add({ meta: { key: 'ODU9', label: '실외기-9' }, outdoorUnit: odu() })
    expect(res.event).toMatchObject({ type: 'GroupAdded', key: 'ODU9' })
    expect(repo.load().groupByKey('ODU9').indoorUnits).toHaveLength(0)
  })

  it('RemoveGroup: 그룹을 제거하고 실내기를 풀로 반환, 이벤트를 낸다', () => {
    const remove = makeRemoveGroup({ planRepository: repo })
    const res = remove({ key: 'ODU1' })
    expect(res.event).toMatchObject({ type: 'GroupRemoved', key: 'ODU1', releasedIds: ['AC_001'] })
    expect(repo.load().groupByKey('ODU1')).toBeUndefined()
    expect(repo.load().locationOf('AC_001')).toBe('pool')
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

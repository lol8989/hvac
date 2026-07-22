import { describe, it, expect } from 'vitest'
import { OutdoorGroup } from './OutdoorGroup'
import { OutdoorUnit } from './OutdoorUnit'
import { IndoorUnit, indoorUnitId } from './IndoorUnit'
import { ComboRatio } from '../shared/ComboRatio'
import { ComboRange } from '../shared/ComboRange'

// ── 테스트 픽스처 헬퍼 ──
const odu = (over = {}) =>
  new OutdoorUnit({ model: 'RPUW12BX9M', category: '냉난방 절환형', sys: 'EHP', capacityKw: 34.8, maxConnections: 4, ...over })

// 실내기 1대. n으로 같은 실의 2대째를 만든다.
const idu = (roomId: string, coolKw: number, sys = 'EHP', n = 1) =>
  new IndoorUnit({ id: indoorUnitId(roomId, n), roomId, roomName: roomId, coolKw, sys })

const group = (over = {}) => new OutdoorGroup({ key: 'ODU1', label: '실외기-1', outdoorUnit: odu(), indoorUnits: [], ...over })

describe('OutdoorGroup (실외기 조합 애그리거트)', () => {
  it('실내기 목록은 방어적 복사본을 반환한다(외부 변경 차단)', () => {
    const g = group({ indoorUnits: [idu('AC_001', 11.2)] })
    g.indoorUnits.push(idu('AC_099', 1))
    expect(g.indoorUnits).toHaveLength(1)
  })

  it('roomIds는 연결된 실을 유일하게 반환한다(한 실 2대여도 1개)', () => {
    const g = group({ indoorUnits: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2), idu('AC_002', 5)] })
    expect(g.roomIds).toEqual(['AC_001', 'AC_002'])
    expect(g.indoorUnits).toHaveLength(3)
  })

  describe('[적대] 생성 시점 구조 불변식', () => {
    it('계열이 다른 실내기가 섞인 채로는 그룹을 생성할 수 없다', () => {
      expect(() => group({ indoorUnits: [idu('AC_001', 11.2, 'EHP'), idu('AC_009', 5, 'GHP')] })).toThrow()
    })

    it('중복 id 실내기로는 그룹을 생성할 수 없다', () => {
      expect(() => group({ indoorUnits: [idu('AC_001', 11.2), idu('AC_001', 11.2)] })).toThrow()
    })
  })

  describe('assign — 실내기 배정 불변식', () => {
    it('같은 계열이면 배정되고 새 그룹을 반환한다(불변)', () => {
      const g0 = group()
      const g1 = g0.assign(idu('AC_001', 11.2, 'EHP'))
      expect(g0.indoorUnits).toHaveLength(0) // 원본 불변
      expect(g1.indoorUnits.map((i) => i.id)).toEqual(['AC_001#1'])
    })

    it('계열이 다른 실내기 배정은 거부한다 (SERIES_MISMATCH)', () => {
      const g = group() // EHP 실외기
      expect(g.canAssign(idu('AC_009', 5, 'GHP'))).toMatchObject({ ok: false, reason: 'SERIES_MISMATCH' })
      expect(() => g.assign(idu('AC_009', 5, 'GHP'))).toThrow()
    })

    it('maxConnections는 실이 아니라 실내기 대수를 센다', () => {
      // maxConn 2. 한 실(AC_001)에 2대를 넣으면 이미 가득 찬다.
      let g = group({ outdoorUnit: odu({ maxConnections: 2 }) })
      g = g.assign(idu('AC_001', 5, 'EHP', 1)).assign(idu('AC_001', 5, 'EHP', 2))
      expect(g.roomIds).toHaveLength(1) // 실은 1곳뿐인데
      expect(g.canAssign(idu('AC_002', 5))).toMatchObject({ ok: false, reason: 'MAX_CONNECTIONS' })
    })

    it('maxConnections 초과 배정은 거부한다 (MAX_CONNECTIONS)', () => {
      let g = group({ outdoorUnit: odu({ maxConnections: 2 }) })
      g = g.assign(idu('AC_001', 5)).assign(idu('AC_002', 5))
      expect(g.canAssign(idu('AC_003', 5))).toMatchObject({ ok: false, reason: 'MAX_CONNECTIONS' })
      expect(() => g.assign(idu('AC_003', 5))).toThrow()
    })

    it('[적대] 같은 실내기를 두 번 배정해도 중복되지 않는다 (DUPLICATE)', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2)] })
      expect(g.canAssign(idu('AC_001', 11.2))).toMatchObject({ ok: false, reason: 'DUPLICATE' })
      expect(() => g.assign(idu('AC_001', 11.2))).toThrow()
    })
  })

  describe('assignMany — 실 단위 배정(한 실의 모든 대수를 함께)', () => {
    it('여러 대를 한 번에 배정한다', () => {
      const g = group().assignMany([idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2)])
      expect(g.indoorUnits).toHaveLength(2)
    })

    it('[적대] 합쳐서 maxConnections를 넘으면 한 대도 배정하지 않는다(전부 아니면 전무)', () => {
      const g = group({ outdoorUnit: odu({ maxConnections: 3 }), indoorUnits: [idu('AC_000', 5)] })
      const two = [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2), idu('AC_001', 5, 'EHP', 3)]
      expect(g.canAssignMany(two)).toMatchObject({ ok: false, reason: 'MAX_CONNECTIONS' })
      expect(() => g.assignMany(two)).toThrow()
      expect(g.indoorUnits).toHaveLength(1) // 원본 불변
    })

    it('[적대] 빈 목록 배정은 무해하다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 5)] })
      expect(g.assignMany([]).indoorUnits).toHaveLength(1)
    })
  })

  describe('unassign — 실내기 해제', () => {
    it('id로 해제하면 목록에서 제거된 새 그룹을 반환한다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2), idu('AC_002', 5.6)] })
      const g2 = g.unassign('AC_001#1')
      expect(g2.indoorUnits.map((i) => i.id)).toEqual(['AC_002#1'])
    })

    it('없는 id 해제는 무해하다(그대로)', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2)] })
      expect(g.unassign('NOPE').indoorUnits).toHaveLength(1)
    })

    it('unassignRoom은 그 실의 모든 대수를 함께 뗀다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2), idu('AC_002', 5)] })
      const g2 = g.unassignRoom('AC_001')
      expect(g2.indoorUnits.map((i) => i.id)).toEqual(['AC_002#1'])
    })
  })

  describe('comboRatio — 조합비 계산 (설치 정격용량 합 기준)', () => {
    it('연결 실내기 합 / 실외기 용량으로 ComboRatio를 만든다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2), idu('AC_003', 9.0), idu('AC_006', 4.5)] })
      const r = g.comboRatio()
      expect(r).toBeInstanceOf(ComboRatio)
      expect(r.toFixed(2)).toBe('0.71') // 24.7 / 34.8
    })

    it('한 실에 2대면 2대 모두 조합비에 더해진다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 5.6, 'EHP', 1), idu('AC_001', 5.6, 'EHP', 2)] })
      expect(g.comboRatio().indoorTotalKw).toBeCloseTo(11.2, 6)
    })

    it('실내기가 없으면 조합비 0, 저부하 경고', () => {
      const g = group()
      expect(g.comboRatio().value).toBe(0)
      expect(g.warnings()).toContain('UNDERLOADED')
    })

    it('[경계] 0.5/1.03은 경고 없음, 0.49/1.04는 경고', () => {
      const capa = 100 // 실외기 용량 100kW로 경계 계산 단순화
      const at = (kw: number) => group({ outdoorUnit: odu({ capacityKw: capa, maxConnections: 99 }), indoorUnits: [idu('AC_1', kw)] })
      expect(at(50).warnings()).not.toContain('UNDERLOADED') // 0.50
      expect(at(103).warnings()).not.toContain('OVERLOADED') // 1.03
      expect(at(49).warnings()).toContain('UNDERLOADED') // 0.49
      expect(at(104).warnings()).toContain('OVERLOADED') // 1.04
    })

    it('실외기 comboRange(0.3~1.0)를 따르면 조합비 0.32는 경고 없음이다', () => {
      const doas = odu({ capacityKw: 100, maxConnections: 99, comboRange: new ComboRange(0.3, 1.0) })
      const g = group({ outdoorUnit: doas, indoorUnits: [idu('AC_1', 32)] }) // 0.32 (DOAS 실데이터)
      expect(g.warnings()).toEqual([])
    })

    it('실외기 comboRange(0.3~1.0)를 따르면 조합비 1.1은 OVERLOADED다', () => {
      const doas = odu({ capacityKw: 100, maxConnections: 99, comboRange: new ComboRange(0.3, 1.0) })
      const g = group({ outdoorUnit: doas, indoorUnits: [idu('AC_1', 110)] }) // 1.10
      expect(g.warnings()).toContain('OVERLOADED')
    })

    it('조합비가 범위를 벗어나도 배정 자체는 허용된다(경고만)', () => {
      const g = group({ outdoorUnit: odu({ capacityKw: 10, maxConnections: 99 }) })
      const g2 = g.assign(idu('AC_001', 20)) // 비율 2.0
      expect(g2.indoorUnits).toHaveLength(1)
      expect(g2.warnings()).toContain('OVERLOADED')
    })
  })

  describe('replaceModel — 실외기 모델 교체', () => {
    it('같은 계열로 교체하면 실내기는 유지되고 방출은 없다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2), idu('AC_003', 9.0)] })
      const { group: g2, ejected } = g.replaceModel(odu({ model: 'RPUW16BX9M', capacityKw: 45.0 }))
      expect(ejected).toHaveLength(0)
      expect(g2.outdoorUnit.model.value).toBe('RPUW16BX9M')
      expect(g2.indoorUnits).toHaveLength(2)
    })

    it('계열이 바뀌면 호환 안 되는 실내기를 방출 목록으로 돌려준다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2, 'EHP'), idu('AC_003', 9.0, 'EHP')] })
      const { group: g2, ejected } = g.replaceModel(odu({ model: 'GPUW280C2S', sys: 'GHP', category: 'GHP', capacityKw: 28.0 }))
      expect(g2.indoorUnits).toHaveLength(0)
      expect(ejected.map((i) => i.id).sort()).toEqual(['AC_001#1', 'AC_003#1'])
      expect(g2.outdoorUnit.energySource.code).toBe('GHP')
    })
  })

  describe('split — 그룹 분할 (실 단위)', () => {
    it('실을 절반으로 나눠 새 그룹으로 옮긴다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 5), idu('AC_002', 5), idu('AC_003', 5), idu('AC_004', 5)] })
      const { group: kept, newGroup } = g.split({ key: 'ODU2', label: '실외기-2' })
      expect(kept.roomIds).toHaveLength(2)
      expect(newGroup.roomIds).toHaveLength(2)
      expect(newGroup.outdoorUnit.model.value).toBe(kept.outdoorUnit.model.value)
      // 원본 실내기 집합이 보존된다(중복/유실 없음)
      const all = [...kept.indoorUnits, ...newGroup.indoorUnits].map((i) => i.id).sort()
      expect(all).toEqual(['AC_001#1', 'AC_002#1', 'AC_003#1', 'AC_004#1'])
    })

    it('한 실의 여러 대수는 쪼개지지 않고 같은 그룹에 남는다', () => {
      const g = group({
        outdoorUnit: odu({ maxConnections: 9 }),
        indoorUnits: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2), idu('AC_002', 5), idu('AC_003', 5)],
      })
      const { group: kept, newGroup } = g.split({ key: 'ODU2', label: '실외기-2' })
      const roomOf = (grp: OutdoorGroup, rid: string) => grp.indoorUnits.filter((u) => u.roomId === rid).length
      // AC_001의 2대는 한쪽에 온전히 몰려 있어야 한다
      expect(roomOf(kept, 'AC_001') + roomOf(newGroup, 'AC_001')).toBe(2)
      expect(roomOf(kept, 'AC_001') === 2 || roomOf(newGroup, 'AC_001') === 2).toBe(true)
    })

    it('[적대] 실이 2곳 미만이면 분할할 수 없다 (한 실 2대여도 마찬가지)', () => {
      const one = group({ indoorUnits: [idu('AC_001', 5)] })
      expect(() => one.split({ key: 'ODU2', label: '실외기-2' })).toThrow()
      const twoUnitsOneRoom = group({ indoorUnits: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2)] })
      expect(() => twoUnitsOneRoom.split({ key: 'ODU2', label: '실외기-2' })).toThrow()
    })
  })

  describe('retainFrom — 배치 동기화(canAssignMany 규칙 재사용)', () => {
    const desired = (units: IndoorUnit[]) => {
      const m = new Map<string, IndoorUnit[]>()
      for (const u of units) (m.get(u.roomId) ?? m.set(u.roomId, []).get(u.roomId)!).push(u)
      return m
    }

    it('원하는 구성이 그대로 유지되면 전 실을 유지한다(불변)', () => {
      const g0 = group({ indoorUnits: [idu('AC_001', 5), idu('AC_002', 5)] })
      const g1 = g0.retainFrom(desired([idu('AC_001', 5), idu('AC_002', 5)]))
      expect(g1.roomIds).toEqual(['AC_001', 'AC_002'])
      expect(g0.indoorUnits).toHaveLength(2) // 원본 불변
    })

    it('계열이 바뀐 실은 뺀다(교차 계열 방출)', () => {
      const g0 = group({ indoorUnits: [idu('AC_001', 5, 'EHP'), idu('AC_002', 5, 'EHP')] })
      const g1 = g0.retainFrom(desired([idu('AC_001', 5, 'GHP'), idu('AC_002', 5, 'EHP')]))
      expect(g1.roomIds).toEqual(['AC_002']) // GHP로 바뀐 AC_001 방출
    })

    it('대수가 늘어 maxConnections를 넘기는 실은 뺀다', () => {
      // maxConnections=4. AC_001 3대 + AC_002가 2대로 늘면 5대 → AC_002 방출
      const g0 = group({ indoorUnits: [idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2), idu('AC_001', 5, 'EHP', 3), idu('AC_002', 5)] })
      const g1 = g0.retainFrom(desired([
        idu('AC_001', 5, 'EHP', 1), idu('AC_001', 5, 'EHP', 2), idu('AC_001', 5, 'EHP', 3),
        idu('AC_002', 5, 'EHP', 1), idu('AC_002', 5, 'EHP', 2),
      ]))
      expect(g1.roomIds).toEqual(['AC_001'])
      expect(g1.indoorUnits).toHaveLength(3)
    })

    it('배치에서 사라진 실은 뺀다', () => {
      const g0 = group({ indoorUnits: [idu('AC_001', 5), idu('AC_002', 5)] })
      const g1 = g0.retainFrom(desired([idu('AC_001', 5)])) // AC_002 사라짐
      expect(g1.roomIds).toEqual(['AC_001'])
    })
  })
})

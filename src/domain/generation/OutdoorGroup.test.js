import { describe, it, expect } from 'vitest'
import { OutdoorGroup } from './OutdoorGroup.js'
import { OutdoorUnit } from './OutdoorUnit.js'
import { IndoorUnit } from './IndoorUnit.js'
import { ComboRatio } from '../shared/ComboRatio.js'

// ── 테스트 픽스처 헬퍼 ──
const odu = (over = {}) =>
  new OutdoorUnit({ model: 'RPUW12BX9M', category: '냉난방 절환형', sys: 'EHP', capacityKw: 34.8, maxConnections: 4, ...over })

const idu = (id, coolKw, sys = 'EHP') => new IndoorUnit({ id, roomName: id, coolKw, sys })

const group = (over = {}) => new OutdoorGroup({ key: 'ODU1', label: '실외기-1', outdoorUnit: odu(), indoorUnits: [], ...over })

describe('OutdoorGroup (실외기 조합 애그리거트)', () => {
  it('실내기 목록은 방어적 복사본을 반환한다(외부 변경 차단)', () => {
    const g = group({ indoorUnits: [idu('AC_001', 11.2)] })
    g.indoorUnits.push(idu('AC_099', 1))
    expect(g.indoorUnits).toHaveLength(1)
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
      expect(g1.indoorUnits.map((i) => i.id)).toEqual(['AC_001'])
    })

    it('계열이 다른 실내기 배정은 거부한다 (SERIES_MISMATCH)', () => {
      const g = group() // EHP 실외기
      expect(g.canAssign(idu('AC_009', 5, 'GHP'))).toMatchObject({ ok: false, reason: 'SERIES_MISMATCH' })
      expect(() => g.assign(idu('AC_009', 5, 'GHP'))).toThrow()
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

  describe('unassign — 실내기 해제', () => {
    it('id로 해제하면 목록에서 제거된 새 그룹을 반환한다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2), idu('AC_002', 5.6)] })
      const g2 = g.unassign('AC_001')
      expect(g2.indoorUnits.map((i) => i.id)).toEqual(['AC_002'])
    })

    it('없는 id 해제는 무해하다(그대로)', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2)] })
      expect(g.unassign('NOPE').indoorUnits).toHaveLength(1)
    })
  })

  describe('comboRatio — 조합비 계산', () => {
    it('연결 실내기 합 / 실외기 용량으로 ComboRatio를 만든다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 11.2), idu('AC_003', 9.0), idu('AC_006', 4.5)] })
      const r = g.comboRatio()
      expect(r).toBeInstanceOf(ComboRatio)
      expect(r.toFixed(2)).toBe('0.71') // 24.7 / 34.8
    })

    it('실내기가 없으면 조합비 0, 저부하 경고', () => {
      const g = group()
      expect(g.comboRatio().value).toBe(0)
      expect(g.warnings()).toContain('UNDERLOADED')
    })

    it('[경계] 0.5/1.3은 경고 없음, 0.49/1.31은 경고', () => {
      const capa = 100 // 실외기 용량 100kW로 경계 계산 단순화
      const at = (kw) => group({ outdoorUnit: odu({ capacityKw: capa, maxConnections: 99 }), indoorUnits: [idu('AC_1', kw)] })
      expect(at(50).warnings()).not.toContain('UNDERLOADED') // 0.50
      expect(at(130).warnings()).not.toContain('OVERLOADED') // 1.30
      expect(at(49).warnings()).toContain('UNDERLOADED') // 0.49
      expect(at(131).warnings()).toContain('OVERLOADED') // 1.31
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
      expect(ejected.map((i) => i.id).sort()).toEqual(['AC_001', 'AC_003'])
      expect(g2.outdoorUnit.energySource.code).toBe('GHP')
    })
  })

  describe('split — 그룹 분할', () => {
    it('실내기 절반을 같은 실외기 모델의 새 그룹으로 옮긴다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 5), idu('AC_002', 5), idu('AC_003', 5), idu('AC_004', 5)] })
      const { group: kept, newGroup } = g.split({ key: 'ODU2', label: '실외기-2' })
      expect(kept.indoorUnits).toHaveLength(2)
      expect(newGroup.indoorUnits).toHaveLength(2)
      expect(newGroup.outdoorUnit.model.value).toBe(kept.outdoorUnit.model.value)
      // 원본 실내기 집합이 보존된다(중복/유실 없음)
      const all = [...kept.indoorUnits, ...newGroup.indoorUnits].map((i) => i.id).sort()
      expect(all).toEqual(['AC_001', 'AC_002', 'AC_003', 'AC_004'])
    })

    it('[적대] 실내기가 2개 미만이면 분할할 수 없다', () => {
      const g = group({ indoorUnits: [idu('AC_001', 5)] })
      expect(() => g.split({ key: 'ODU2', label: '실외기-2' })).toThrow()
    })
  })
})

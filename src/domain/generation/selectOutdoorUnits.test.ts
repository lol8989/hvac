// 실외기 선정 규칙 테스트 (Generation 컨텍스트).
// 실내기를 다 배치해야 총 정격용량이 확정되고, 그래야 실외기를 고를 수 있다(주인님 2026-07-10).
// 규칙: 층 × 계열로 묶고, 조합비 허용범위를 만족하는 '최소 용량' 실외기를 고른다.
//       최대 연결 대수·40HP를 넘으면 분할한다. 한 실의 대수는 쪼개지 않는다.

import { describe, it, expect } from 'vitest'
import { selectOutdoorUnits, MAX_OUTDOOR_HP } from './selectOutdoorUnits'
import type { OutdoorCandidate, IndoorForSelection } from './selectOutdoorUnits'
import { NoCompatibleOutdoorError, UnpackableLoadError } from './errors'
import { ComboRange } from '../shared/ComboRange'

// 전역 기본 정책: 50%~103% (Confluence 「자동배치 룰」 확정값)
const DEFAULT = ComboRange.DEFAULT

const cand = (model: string, capacityKw: number, over: Partial<OutdoorCandidate> = {}): OutdoorCandidate => ({
  model,
  energySource: 'EHP',
  capacityKw,
  heatKw: capacityKw * 1.1, // 기본은 냉난방 절환형
  hp: Math.round(capacityKw / 2.8),
  maxConnections: 16,
  comboRange: DEFAULT,
  ...over,
})

// EHP 실외기 라인업(용량 오름차순)
const EHP = [cand('E-22', 22.4), cand('E-28', 28.0), cand('E-34', 34.8), cand('E-45', 45.0)]

let seq = 0
const unit = (roomId: string, coolKw: number, over: Partial<IndoorForSelection> = {}): IndoorForSelection => ({
  id: `${roomId}#${++seq}`,
  roomId,
  floor: '지상1층',
  energySource: 'EHP',
  coolKw,
  ...over,
})
// 한 실에 n대
const room = (roomId: string, coolKw: number, n = 1, over: Partial<IndoorForSelection> = {}) =>
  Array.from({ length: n }, () => unit(roomId, coolKw, over))

describe('selectOutdoorUnits — 단일 실외기로 커버되는 경우', () => {
  it('허용범위를 만족하는 최소 용량 모델을 고른다', () => {
    // 정격 합 28.4kW → 22.4는 1.27(초과), 28.0은 1.01(OK), 34.8은 0.82(OK, 과대)
    const units = [...room('R1', 14.2), ...room('R2', 14.2)]
    const [g] = selectOutdoorUnits(units, EHP)

    expect(g.model).toBe('E-28')
    expect(g.roomIds).toEqual(['R1', 'R2'])
    expect(g.unitIds).toHaveLength(2)
    expect(g.floor).toBe('지상1층')
    expect(g.energySource).toBe('EHP')
  })

  it('한 실의 여러 대수를 모두 합산한다', () => {
    // R1에 5.6kW 5대 = 28.0 → E-28이 정확히 1.00
    const [g] = selectOutdoorUnits(room('R1', 5.6, 5), EHP)
    expect(g.model).toBe('E-28')
    expect(g.unitIds).toHaveLength(5)
    expect(g.roomIds).toEqual(['R1'])
  })

  it('[경계] 조합비 1.03은 허용, 1.04는 그 모델을 배제한다', () => {
    const only = [cand('E-100', 100)]
    expect(selectOutdoorUnits(room('R1', 103), only)[0].model).toBe('E-100') // 1.03 OK
    // 1.04 → 이 모델로는 안 되고 다른 후보도 없다 → 분할 시도 → 한 실은 못 쪼갠다
    expect(() => selectOutdoorUnits(room('R1', 104), only)).toThrow(UnpackableLoadError)
  })

  it('[경계] 조합비 0.50 미만(과대)이어도 더 작은 모델이 없으면 그 모델로 선정한다(저부하 경고는 그룹이 낸다)', () => {
    const only = [cand('E-100', 100)]
    const [g] = selectOutdoorUnits(room('R1', 10), only) // 0.10
    expect(g.model).toBe('E-100')
  })

  it('모델별 comboRange를 따른다 — 상한 1.0이면 1.01은 그 모델을 배제한다', () => {
    // hp는 40 이하로 둔다(40HP 상한 필터에 걸리지 않도록) — 여기 검증 대상은 comboRange다.
    const strict = [cand('S-100', 100, { comboRange: new ComboRange(0.5, 1.0), hp: 35 }), cand('S-200', 200, { hp: 40 })]
    const [g] = selectOutdoorUnits(room('R1', 101), strict)
    expect(g.model).toBe('S-200') // 100은 1.01로 초과 → 200 선택
  })
})

describe('selectOutdoorUnits — 냉난방 요구', () => {
  // 계열(EHP)만으로는 냉난방을 못 가른다. 같은 EHP에 절환형과 냉방전용이 함께 있다.
  const coolOnly = cand('C-30', 30, { heatKw: null })
  const heatPump = cand('H-45', 45)

  it('난방이 필요하면 냉방전용이 더 작아도 배제한다 (기본값)', () => {
    const [g] = selectOutdoorUnits(room('R1', 28), [coolOnly, heatPump])
    expect(g.model).toBe('H-45') // C-30(0.93)이 더 작지만 냉방전용
  })

  it('난방이 필요 없으면 냉방전용도 후보다', () => {
    const [g] = selectOutdoorUnits(room('R1', 28), [coolOnly, heatPump], { requireHeating: false })
    expect(g.model).toBe('C-30')
  })

  it('[적대] 난방이 필요한데 냉방전용밖에 없으면 NoCompatibleOutdoorError', () => {
    expect(() => selectOutdoorUnits(room('R1', 10), [coolOnly])).toThrow(NoCompatibleOutdoorError)
  })
})

describe('selectOutdoorUnits — 층 × 계열 버킷팅', () => {
  it('층이 다르면 실외기를 나눈다', () => {
    const units = [...room('R1', 20), ...room('R2', 20, 1, { floor: '지상2층' })]
    const gs = selectOutdoorUnits(units, EHP)
    expect(gs).toHaveLength(2)
    expect(gs.map((g) => g.floor).sort()).toEqual(['지상1층', '지상2층'])
  })

  it('계열이 다르면 실외기를 나누고 교차 배정하지 않는다', () => {
    const GHP = cand('G-28', 28.0, { energySource: 'GHP' })
    const units = [...room('R1', 20), ...room('R2', 20, 1, { energySource: 'GHP' })]
    const gs = selectOutdoorUnits(units, [...EHP, GHP])

    expect(gs).toHaveLength(2)
    const ehp = gs.find((g) => g.energySource === 'EHP')!
    const ghp = gs.find((g) => g.energySource === 'GHP')!
    expect(ehp.roomIds).toEqual(['R1'])
    expect(ghp.roomIds).toEqual(['R2'])
    expect(ghp.model).toBe('G-28')
  })

  it('[적대] 그 계열에 후보 실외기가 없으면 NoCompatibleOutdoorError', () => {
    const units = room('R1', 10, 1, { energySource: 'GHP' })
    expect(() => selectOutdoorUnits(units, EHP)).toThrow(NoCompatibleOutdoorError)
  })
})

describe('selectOutdoorUnits — 분할', () => {
  it('용량 상한을 넘으면 여러 대로 나눈다', () => {
    // 정격 합 90kW. 최대 후보 45kW × 1.03 = 46.35 → 최소 2대
    const units = [...room('R1', 30), ...room('R2', 30), ...room('R3', 30)]
    const gs = selectOutdoorUnits(units, EHP)

    expect(gs.length).toBeGreaterThanOrEqual(2)
    // 실은 정확히 한 그룹에만
    const all = gs.flatMap((g) => g.roomIds)
    expect(new Set(all).size).toBe(all.length)
    expect(all.sort()).toEqual(['R1', 'R2', 'R3'])
  })

  it('최대 연결 대수를 넘으면 나눈다 (용량이 남아도)', () => {
    const small = [cand('E-45x2', 45.0, { maxConnections: 2 })]
    const units = [...room('R1', 8), ...room('R2', 8), ...room('R3', 8)] // 24kW, 3대
    const gs = selectOutdoorUnits(units, small)

    expect(gs).toHaveLength(2)
    for (const g of gs) expect(g.unitIds.length).toBeLessThanOrEqual(2)
  })

  it('한 실의 여러 대수는 분할해도 같은 실외기에 남는다', () => {
    const units = [...room('R1', 12, 3), ...room('R2', 12, 3)] // 36 + 36 = 72kW
    const gs = selectOutdoorUnits(units, EHP)

    for (const rid of ['R1', 'R2']) {
      const owners = gs.filter((g) => g.roomIds.includes(rid))
      expect(owners).toHaveLength(1) // 정확히 한 그룹
      expect(owners[0].unitIds.filter((id) => id.startsWith(rid + '#'))).toHaveLength(3)
    }
  })

  it(`40HP를 넘는 실외기는 후보에서 뺀다 (MAX_OUTDOOR_HP=${MAX_OUTDOOR_HP})`, () => {
    const huge = cand('E-BIG', 200, { hp: 60 })
    const units = room('R1', 100, 1)
    // 200kW 1대면 0.5로 딱 맞지만 60HP라 배제 → 45kW 후보로는 한 실을 못 담는다
    expect(() => selectOutdoorUnits(units, [...EHP, huge])).toThrow(UnpackableLoadError)
  })

  it('[적대] 한 실의 대수가 최대 연결 대수를 넘으면 UnpackableLoadError', () => {
    const small = [cand('E-45x2', 45.0, { maxConnections: 2 })]
    expect(() => selectOutdoorUnits(room('R1', 5, 3), small)).toThrow(UnpackableLoadError)
  })

  it('[적대] 한 실의 정격 합이 최대 실외기 용량×상한을 넘으면 UnpackableLoadError', () => {
    // 45.0 × 1.03 = 46.35 < 50
    expect(() => selectOutdoorUnits(room('R1', 50), EHP)).toThrow(UnpackableLoadError)
  })
})

describe('selectOutdoorUnits — 조합표(isCompatible) 주입', () => {
  // 계열(byEnergySource) 대신 시리즈×유형 호환을 주입하면 조합표를 따른다.
  it('계열이 달라도 조합표가 허용하면 한 실외기에 묶는다 (GHP↔대공간덕트)', () => {
    const ghp = cand('G-30', 30, { energySource: 'GHP', subcategory: 'GHP', series: 'GHP Super III' })
    // 대공간덕트 실내기는 계열이 EHP지만 조합표상 GHP Super III에 연결된다.
    const units = room('R1', 20, 1, { energySource: 'EHP', subcategory: '덕트(대공간)', series: '대공간덕트' })
    const isCompatible = (o: { series?: string }, i: { subcategory?: string }) => o.series === 'GHP Super III' && i.subcategory === '덕트(대공간)'
    const [g] = selectOutdoorUnits(units, [ghp, ...EHP], { isCompatible })
    expect(g.model).toBe('G-30') // EHP 후보는 대공간덕트와 X → 계열이 교차해도 GHP로 묶인다
    expect(g.energySource).toBe('GHP')
    expect(g.roomIds).toEqual(['R1'])
  })

  it('조합표가 X면 계열이 같아도 더 작은 그 실외기를 배제한다', () => {
    const a = cand('A-30', 30, { series: 'Series-A' }) // 더 작지만 이 실내기와 X
    const b = cand('B-40', 40, { series: 'Series-B' })
    const units = room('R1', 20, 1, { subcategory: '4WAY 카세트', series: '민수' })
    const isCompatible = (o: { series?: string }) => o.series === 'Series-B'
    const [g] = selectOutdoorUnits(units, [a, b], { isCompatible })
    expect(g.model).toBe('B-40')
  })

  it('한 실외기는 담긴 모든 실내기 유형과 호환돼야 한다', () => {
    // R1 대공간덕트 · R2 4WAY. GHP는 대공간덕트만 가능 → 둘의 공통 후보는 Multi V뿐.
    const ghp = cand('G-50', 50, { energySource: 'GHP', series: 'GHP Super III' })
    const ehp = cand('M-50', 50, { energySource: 'EHP', series: 'Multi V' })
    const units = [
      ...room('R1', 15, 1, { energySource: 'EHP', subcategory: '덕트(대공간)', series: '대공간덕트' }),
      ...room('R2', 15, 1, { energySource: 'EHP', subcategory: '4WAY 카세트', series: '민수' }),
    ]
    const isCompatible = (o: { series?: string }, i: { subcategory?: string }) =>
      o.series === 'Multi V' ? true : o.series === 'GHP Super III' ? i.subcategory === '덕트(대공간)' : false
    const gs = selectOutdoorUnits(units, [ghp, ehp], { isCompatible })
    expect(gs).toHaveLength(1)
    expect(gs[0].model).toBe('M-50')
    expect(gs[0].roomIds.sort()).toEqual(['R1', 'R2'])
  })

  it('[적대] 조합표상 어떤 실외기와도 호환 안 되면 NoCompatibleOutdoorError', () => {
    const units = room('R1', 20, 1, { subcategory: '없는유형', series: '없음' })
    const never = () => false
    expect(() => selectOutdoorUnits(units, EHP, { isCompatible: never })).toThrow(NoCompatibleOutdoorError)
  })
})

describe('selectOutdoorUnits — 경계·빈 입력', () => {
  it('실내기가 없으면 그룹도 없다', () => {
    expect(selectOutdoorUnits([], EHP)).toEqual([])
  })

  it('[적대] 후보 카탈로그가 비면 실내기가 있을 때만 예외', () => {
    expect(selectOutdoorUnits([], [])).toEqual([])
    expect(() => selectOutdoorUnits(room('R1', 10), [])).toThrow(NoCompatibleOutdoorError)
  })

  it('같은 입력은 같은 결과를 낸다(결정적)', () => {
    const units = [...room('R1', 30), ...room('R2', 30), ...room('R3', 30)]
    const a = selectOutdoorUnits(units, EHP)
    const b = selectOutdoorUnits(units, EHP)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('모든 실내기가 정확히 한 그룹에 배정된다(유실·중복 없음)', () => {
    const units = [...room('R1', 12, 2), ...room('R2', 9), ...room('R3', 20, 2), ...room('R4', 6)]
    const gs = selectOutdoorUnits(units, EHP)
    const assigned = gs.flatMap((g) => g.unitIds)
    expect(new Set(assigned).size).toBe(units.length)
    expect(assigned.sort()).toEqual(units.map((u) => u.id).sort())
  })
})

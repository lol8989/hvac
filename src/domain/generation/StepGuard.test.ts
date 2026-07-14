// 스텝 가드 테스트 (Generation 컨텍스트 · 순수 도메인).
// "다음 단계로 가기 전에 해야 할 일을 안 했으면 막고, 왜 못 가는지·어떻게 풀지 알려준다."
// 되돌리기 어려운 파괴적 액션(재검출·시설군 변경)은 확인을 받는다.

import { describe, it, expect } from 'vitest'
import { guardAdvance, guardRegress, guardDestructive, emptyGuardContext } from './StepGuard'
import type { GuardContext } from './StepGuard'

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({ ...emptyGuardContext(), ...over })

// 전 실에 실내기가 있고, 그룹 1대에 전부 배정되고, 도면에도 배치된 '정상' 상태
const healthy = (over: Partial<GuardContext> = {}): GuardContext =>
  ctx({
    roomCount: 3,
    placedRoomCount: 3,
    roomsWithoutIndoor: [],
    unassignedRoomCount: 0,
    activeGroupCount: 1,
    overloadedGroups: [],
    emptyGroupCount: 0,
    groupsWithoutPosition: [],
    clearanceViolations: [],
    selectionRowCount: 3,
    ...over,
  })

describe('guardAdvance — detect(실 검출)', () => {
  it('실을 하나도 못 찾았으면 막는다', () => {
    const v = guardAdvance('detect', ctx({ roomCount: 0 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('NO_ROOMS')
  })

  it('실이 있으면 통과', () => {
    expect(guardAdvance('detect', ctx({ roomCount: 3 })).kind).toBe('ALLOW')
  })
})

describe('guardAdvance — place(실내기 배치)', () => {
  it('실내기 없는 실이 있으면 막고, 실명을 사유에 담는다', () => {
    const v = guardAdvance('place', healthy({ roomsWithoutIndoor: ['로비', '탕비실'] }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') {
      expect(v.code).toBe('ROOMS_WITHOUT_INDOOR')
      expect(v.reason).toContain('로비')
      expect(v.reason).toContain('탕비실')
      expect(v.remedy).not.toBe('') // 어떻게 풀지 알려준다
    }
  })

  it('부하를 확정해야 실외기를 고를 수 있다는 것이 막는 이유다', () => {
    const v = guardAdvance('place', healthy({ roomsWithoutIndoor: ['로비'] }))
    if (v.kind === 'BLOCK') expect(v.reason).toContain('부하')
  })

  it('전 실에 실내기가 있으면 통과', () => {
    expect(guardAdvance('place', healthy()).kind).toBe('ALLOW')
  })
})

describe('guardAdvance — combine(실외기 선정·조합)', () => {
  it('미배정 실내기가 남아 있으면 막는다', () => {
    const v = guardAdvance('combine', healthy({ unassignedRoomCount: 2 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('UNASSIGNED_ROOMS')
  })

  it('실외기가 한 대도 없으면 막는다', () => {
    const v = guardAdvance('combine', healthy({ activeGroupCount: 0 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('NO_OUTDOOR')
  })

  it('미배정과 실외기 0이 동시면 미배정을 먼저 알린다(원인이 앞선다)', () => {
    const v = guardAdvance('combine', healthy({ unassignedRoomCount: 1, activeGroupCount: 0 }))
    if (v.kind === 'BLOCK') expect(v.code).toBe('UNASSIGNED_ROOMS')
  })

  it('과부하 그룹이 있으면 막지는 않되 확인을 받는다', () => {
    const v = guardAdvance('combine', healthy({ overloadedGroups: ['실외기-1'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('OVERLOADED')
      expect(v.reason).toContain('실외기-1')
    }
  })

  it('빈 실외기가 있으면 산출물에서 빠진다고 확인을 받는다', () => {
    const v = guardAdvance('combine', healthy({ emptyGroupCount: 1 }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('EMPTY_GROUPS')
  })

  it('차단 사유가 확인 사유보다 우선한다', () => {
    const v = guardAdvance('combine', healthy({ unassignedRoomCount: 1, overloadedGroups: ['실외기-1'] }))
    expect(v.kind).toBe('BLOCK')
  })

  it('정상이면 통과', () => {
    expect(guardAdvance('combine', healthy()).kind).toBe('ALLOW')
  })
})

describe('guardAdvance — outdoor(실외기 배치)', () => {
  it('도면에 안 놓인 실외기가 있으면 막고 몇 대 중 몇 대인지 알린다', () => {
    const v = guardAdvance('outdoor', healthy({ activeGroupCount: 3, groupsWithoutPosition: ['실외기-2'] }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') {
      expect(v.code).toBe('OUTDOOR_NOT_PLACED')
      expect(v.reason).toContain('3대')
      expect(v.reason).toContain('실외기-2')
    }
  })

  it('이격거리 위반은 막지 않고 확인을 받는다', () => {
    const v = guardAdvance('outdoor', healthy({ clearanceViolations: ['실외기-1 ↔ 실외기-2'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('CLEARANCE')
  })

  it('전부 배치됐으면 통과', () => {
    expect(guardAdvance('outdoor', healthy()).kind).toBe('ALLOW')
  })
})

describe('guardAdvance — output(산출물 생성)', () => {
  it('선정표에 행이 없으면 막는다', () => {
    const v = guardAdvance('output', healthy({ selectionRowCount: 0 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('EMPTY_SELECTION')
  })

  it('행이 있으면 통과', () => {
    expect(guardAdvance('output', healthy()).kind).toBe('ALLOW')
  })
})

describe('guardRegress — 뒤로 가기', () => {
  it('조합이 끝난 뒤 실내기 배치로 돌아가면 조합이 흔들린다고 확인을 받는다', () => {
    const v = guardRegress('outdoor', 'place', healthy())
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('REGRESS_INVALIDATES')
  })

  it('아직 실외기가 없으면 그냥 돌아간다', () => {
    expect(guardRegress('combine', 'place', healthy({ activeGroupCount: 0 })).kind).toBe('ALLOW')
  })

  it('같은 단계나 앞 단계로의 이동은 이 가드의 소관이 아니다', () => {
    expect(guardRegress('place', 'place', healthy()).kind).toBe('ALLOW')
    expect(guardRegress('place', 'combine', healthy()).kind).toBe('ALLOW')
  })

  it('실 검출로 돌아가면 배치까지 초기화된다고 확인을 받는다', () => {
    const v = guardRegress('combine', 'detect', healthy())
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('REGRESS_INVALIDATES')
  })
})

describe('guardDestructive — 되돌리기 어려운 액션', () => {
  it('배치 결과가 있는데 재검출하면 확인을 받는다', () => {
    const v = guardDestructive('REDETECT', healthy())
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('REDETECT')
  })

  it('검출 전 재검출은 확인 없이 통과', () => {
    expect(guardDestructive('REDETECT', ctx({ roomCount: 0 })).kind).toBe('ALLOW')
  })

  it('실은 있으나 실내기가 없으면 재검출은 잃을 게 없다', () => {
    const v = guardDestructive('REDETECT', ctx({ roomCount: 3, roomsWithoutIndoor: ['a', 'b', 'c'], selectionRowCount: 0 }))
    expect(v.kind).toBe('ALLOW')
  })

  it('배치가 없으면 실을 자르는 데 확인이 필요 없다', () => {
    expect(guardDestructive('ROOM_SLICE', ctx({ roomCount: 6 })).kind).toBe('ALLOW')
  })

  it('실내기가 배치된 실을 자르면 대수가 다시 나뉜다고 확인을 받는다', () => {
    const v = guardDestructive('ROOM_SLICE', healthy())
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('ROOM_SLICE')
      expect(v.reason).toContain('대수')
    }
  })

  it('검출 후 시설군을 바꾸면 부하가 다시 계산된다고 확인을 받는다', () => {
    const v = guardDestructive('FACILITY_CHANGE', healthy())
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('FACILITY_CHANGE')
      expect(v.reason).toContain('부하')
    }
  })

  it('검출 전 시설군 변경은 자유롭다', () => {
    expect(guardDestructive('FACILITY_CHANGE', ctx({ roomCount: 0 })).kind).toBe('ALLOW')
  })
})

describe('[적대] 빈 컨텍스트', () => {
  it('아무것도 안 한 상태에서 모든 전진은 막힌다(빈 산출물 방지)', () => {
    for (const step of ['detect', 'place', 'combine', 'outdoor', 'output'] as const) {
      expect(guardAdvance(step, emptyGuardContext()).kind).toBe('BLOCK')
    }
  })

  it('모든 BLOCK은 사유와 해결법을 갖는다(무반응 금지)', () => {
    for (const step of ['detect', 'place', 'combine', 'outdoor', 'output'] as const) {
      const v = guardAdvance(step, emptyGuardContext())
      if (v.kind === 'BLOCK') {
        expect(v.title.length).toBeGreaterThan(0)
        expect(v.reason.length).toBeGreaterThan(0)
        expect(v.remedy.length).toBeGreaterThan(0)
      }
    }
  })
})

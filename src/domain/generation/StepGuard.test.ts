// 스텝 가드 테스트 (Generation 컨텍스트 · 순수 도메인).
// "다음 단계로 가기 전에 해야 할 일을 안 했으면 막고, 왜 못 가는지·어떻게 풀지 알려준다."
// 되돌리기 어려운 파괴적 액션(시설군 변경·실 자르기·병합)은 확인을 받는다.
// (실 검출은 더 이상 스텝이 아니다 — 도면을 열면 실이 이미 검출된 상태다.)

import { describe, it, expect } from 'vitest'
import { guardAdvance, guardRegress, guardDestructive, emptyGuardContext } from './StepGuard'
import type { GuardContext, StepId } from './StepGuard'

const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({ ...emptyGuardContext(), ...over })

// guardAdvance는 그 단계의 **문제 목록**을 준다(빈 배열 = 통과).
// 한 단계에 확인할 것이 둘이면 둘 다 나와야 한다 — 첫 개만 보여주고 넘어가지 않는다.
const first = (from: StepId, c: GuardContext) => guardAdvance(from, c)[0]
const codesOf = (from: StepId, c: GuardContext) => guardAdvance(from, c).map((v) => v.code)

// 전 실에 실내기가 있고, 그룹 1대에 전부 배정되고, 도면에도 배치된 '정상' 상태
const healthy = (over: Partial<GuardContext> = {}): GuardContext =>
  ctx({
    roomCount: 3,
    placedRoomCount: 3,
    roomsWithoutIndoor: [],
    misplacedUnits: [],
    unassignedRoomCount: 0,
    activeGroupCount: 1,
    overloadedGroups: [],
    emptyGroupCount: 0,
    groupsWithoutPosition: [],
    clearanceChecked: true,
    clearanceViolations: [],
    selectionRowCount: 3,
    ...over,
  })

describe('guardAdvance — place(실내기 배치)', () => {
  it('검출된 실이 없으면 막는다(실은 초기 상태에서 시딩되므로 방어적 케이스)', () => {
    const v = first('place', ctx({ roomCount: 0 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('NO_ROOMS')
  })

  // 주인님 지시 2026-07-16: 막지 말고 주의만 하고 넘어갈 수 있게 한다.
  it('실내기 없는 실이 있으면 막지 않고 주의(CONFIRM)만 하며, 실명을 사유에 담는다', () => {
    const v = first('place', healthy({ roomsWithoutIndoor: ['로비', '탕비실'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('ROOMS_WITHOUT_INDOOR')
      expect(v.reason).toContain('로비')
      expect(v.reason).toContain('탕비실')
      expect(v.detail).not.toBe('') // 진행하면 무엇을 잃는지 알려준다
    }
  })

  it('그 실이 산출물에서 제외된다는 것이 주의 사유다', () => {
    const v = first('place', healthy({ roomsWithoutIndoor: ['로비'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.detail).toContain('제외')
  })

  it('전 실에 실내기가 있으면 통과', () => {
    expect(guardAdvance('place', healthy())).toEqual([])
  })
})

// 심볼 1개 = 실내기 1대 = 선정표 대수 1인데, 심볼을 실 밖으로 끌어내도 소속은 안 바뀐다.
// 표는 '거실 1대'라 말하고 도면은 거실 밖에 찍는다 — 조용히 넘기면 안 된다.
describe('guardAdvance — place(실 밖으로 나간 심볼)', () => {
  it('실 밖에 있는 심볼이 있으면 막지 않고 확인을 받는다', () => {
    const v = first('place', healthy({ misplacedUnits: ['거실 2번째 대수가 실 밖에 있습니다'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('MISPLACED_UNITS')
      expect(v.reason).toContain('거실 2번째 대수')
    }
  })

  // 예전엔 판정을 하나만 돌려줘서 앞의 확인이 뒤의 확인을 가렸다 — 사용자가 고치고 다시 눌러야 알았다.
  it('한 단계에 확인이 둘이면 둘 다 알린다(근본적인 것부터)', () => {
    const cs = codesOf('place', healthy({ roomsWithoutIndoor: ['로비'], misplacedUnits: ['거실 2번째 대수가 실 밖에 있습니다'] }))
    expect(cs).toEqual(['ROOMS_WITHOUT_INDOOR', 'MISPLACED_UNITS'])
  })
})

describe('guardAdvance — combine(실외기 선정·조합)', () => {
  it('미배정 실내기가 남아 있으면 막는다', () => {
    const v = first('combine', healthy({ unassignedRoomCount: 2 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('UNASSIGNED_ROOMS')
  })

  it('실외기가 한 대도 없으면 막는다', () => {
    const v = first('combine', healthy({ activeGroupCount: 0 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('NO_OUTDOOR')
  })

  it('미배정과 실외기 0이 동시면 미배정을 먼저 알린다(원인이 앞선다)', () => {
    const v = first('combine', healthy({ unassignedRoomCount: 1, activeGroupCount: 0 }))
    if (v.kind === 'BLOCK') expect(v.code).toBe('UNASSIGNED_ROOMS')
  })

  it('과부하 그룹이 있으면 막지는 않되 확인을 받는다', () => {
    const v = first('combine', healthy({ overloadedGroups: ['실외기-1'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('OVERLOADED')
      expect(v.reason).toContain('실외기-1')
    }
  })

  it('빈 실외기가 있으면 산출물에서 빠진다고 확인을 받는다', () => {
    const v = first('combine', healthy({ emptyGroupCount: 1 }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('EMPTY_GROUPS')
  })

  it('차단 사유가 확인 사유보다 우선한다', () => {
    const v = first('combine', healthy({ unassignedRoomCount: 1, overloadedGroups: ['실외기-1'] }))
    expect(v.kind).toBe('BLOCK')
  })

  it('차단이면 뒤따르는 확인은 싣지 않는다(막는 것부터 풀어야 한다)', () => {
    expect(codesOf('combine', healthy({ unassignedRoomCount: 1, overloadedGroups: ['실외기-1'], emptyGroupCount: 1 })))
      .toEqual(['UNASSIGNED_ROOMS'])
  })

  it('과부하와 빈 실외기가 함께면 둘 다 알린다', () => {
    expect(codesOf('combine', healthy({ overloadedGroups: ['실외기-1'], emptyGroupCount: 1 })))
      .toEqual(['OVERLOADED', 'EMPTY_GROUPS'])
  })

  it('정상이면 통과', () => {
    expect(guardAdvance('combine', healthy())).toEqual([])
  })
})

describe('guardAdvance — outdoor(실외기 배치)', () => {
  it('도면에 안 놓인 실외기가 있으면 막고 몇 대 중 몇 대인지 알린다', () => {
    const v = first('outdoor', healthy({ activeGroupCount: 3, groupsWithoutPosition: ['실외기-2'] }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') {
      expect(v.code).toBe('OUTDOOR_NOT_PLACED')
      expect(v.reason).toContain('3대')
      expect(v.reason).toContain('실외기-2')
    }
  })

  it('이격거리 위반은 막지 않고 확인을 받는다', () => {
    const v = first('outdoor', healthy({ clearanceViolations: ['실외기-1 ↔ 실외기-2'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('CLEARANCE')
  })

  it('전부 배치됐으면 통과', () => {
    expect(guardAdvance('outdoor', healthy())).toEqual([])
  })

  // 검사하지 못한 것을 '위반 0건'으로 읽으면 안 된다(false-green).
  // 축척(mm)을 모르는 도면이면 이격을 잴 수 없다 — 막지는 않되 못 쟀다고 알린다.
  it('이격을 검사하지 못했으면 통과시키지 않고 확인을 받는다', () => {
    const v = first('outdoor', healthy({ clearanceChecked: false }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') {
      expect(v.code).toBe('CLEARANCE_UNKNOWN')
      expect(v.reason).toContain('축척')
    }
  })

  it('위반이 있으면 미검사 안내보다 위반을 먼저 알린다', () => {
    const v = first('outdoor', healthy({ clearanceChecked: false, clearanceViolations: ['실외기-1 ↔ 실외기-2'] }))
    expect(v.kind).toBe('CONFIRM')
    if (v.kind === 'CONFIRM') expect(v.code).toBe('CLEARANCE')
  })
})

describe('guardAdvance — output(산출물 생성)', () => {
  it('선정표에 행이 없으면 막는다', () => {
    const v = first('output', healthy({ selectionRowCount: 0 }))
    expect(v.kind).toBe('BLOCK')
    if (v.kind === 'BLOCK') expect(v.code).toBe('EMPTY_SELECTION')
  })

  it('행이 있으면 통과', () => {
    expect(guardAdvance('output', healthy())).toEqual([])
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
})

describe('guardDestructive — 되돌리기 어려운 액션', () => {
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

  it('배치 전 시설군 변경은 자유롭다(잃을 배치가 없다)', () => {
    expect(guardDestructive('FACILITY_CHANGE', ctx({ placedRoomCount: 0 })).kind).toBe('ALLOW')
  })
})

describe('[적대] 빈 컨텍스트', () => {
  it('아무것도 안 한 상태에서 모든 전진은 막힌다(빈 산출물 방지)', () => {
    for (const step of ['place', 'combine', 'outdoor', 'output'] as const) {
      expect(first(step, emptyGuardContext()).kind).toBe('BLOCK')
    }
  })

  it('모든 BLOCK은 사유와 해결법을 갖는다(무반응 금지)', () => {
    for (const step of ['place', 'combine', 'outdoor', 'output'] as const) {
      const v = first(step, emptyGuardContext())
      if (v.kind === 'BLOCK') {
        expect(v.title.length).toBeGreaterThan(0)
        expect(v.reason.length).toBeGreaterThan(0)
        expect(v.remedy.length).toBeGreaterThan(0)
      }
    }
  })
})

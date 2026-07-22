import { describe, it, expect } from 'vitest'
import { planConfirmFlow } from './confirmEditFlow'
import type { GuardVerdict } from '../../domain/generation/StepGuard'

const ALLOW: GuardVerdict = { kind: 'ALLOW' }
const block = (code = 'NO_ROOMS'): GuardVerdict => ({ kind: 'BLOCK', code: code as never, title: 't', reason: 'r', remedy: 'm' })
const confirm = (code = 'OVERLOADED'): GuardVerdict => ({ kind: 'CONFIRM', code: code as never, title: 't', reason: 'r', detail: 'd' })

describe('planConfirmFlow', () => {
  it('BLOCK이 하나라도 있으면 그 첫 BLOCK을 반환한다(진행 막음)', () => {
    const flow = planConfirmFlow([confirm(), block('UNASSIGNED_ROOMS'), confirm()])
    expect(flow.kind).toBe('block')
    if (flow.kind === 'block') expect(flow.verdict.code).toBe('UNASSIGNED_ROOMS')
  })

  it('BLOCK이 여럿이면 첫 개를 반환한다', () => {
    const flow = planConfirmFlow([block('NO_ROOMS'), block('NO_OUTDOOR')])
    expect(flow.kind).toBe('block')
    if (flow.kind === 'block') expect(flow.verdict.code).toBe('NO_ROOMS')
  })

  it('전부 ALLOW면 바로 진행한다', () => {
    expect(planConfirmFlow([ALLOW, ALLOW, ALLOW])).toEqual({ kind: 'proceed' })
  })

  it('CONFIRM 1건이면 그 1건을 confirm으로 반환한다', () => {
    const flow = planConfirmFlow([ALLOW, confirm('OVERLOADED'), ALLOW])
    expect(flow.kind).toBe('confirm')
    if (flow.kind === 'confirm') expect(flow.confirms).toHaveLength(1)
  })

  it('CONFIRM 여러 건이면 전부 모아 반환한다(첫 개만 보여주고 넘어가지 않는다)', () => {
    const flow = planConfirmFlow([confirm('ROOMS_WITHOUT_INDOOR'), confirm('OVERLOADED'), confirm('CLEARANCE')])
    expect(flow.kind).toBe('confirm')
    if (flow.kind === 'confirm') {
      expect(flow.confirms).toHaveLength(3)
      expect(flow.confirms.map((c) => c.code)).toEqual(['ROOMS_WITHOUT_INDOOR', 'OVERLOADED', 'CLEARANCE'])
    }
  })

  it('BLOCK이 CONFIRM보다 우선한다(막는 걸 먼저 알린다)', () => {
    const flow = planConfirmFlow([confirm('ROOMS_WITHOUT_INDOOR'), block('OUTDOOR_NOT_PLACED')])
    expect(flow.kind).toBe('block')
  })
})

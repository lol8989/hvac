// 게시 전제조건의 계열별 분리 (주인님 확정 2026-07-10).
//
// '최대 연결 실내기 수'는 VRF(실외기 1대에 실내기 N대) 계통의 개념이다.
// 칠러(냉수 배관)·CDU(쇼케이스)·시스템 에어컨 단품(1:1)에는 존재하지 않는다.
// 실데이터에서도 비-VRF 실외기 179건 전부 max_connections가 없다.
// 근거: doc/05_설계결정/마력_환산식_적용_검토.md §5
import { describe, it, expect } from 'vitest'
import { publishBlockReason, canPublish, type PublishCandidate } from './Publishability'

const outdoor = (over: Partial<PublishCandidate> = {}): PublishCandidate => ({
  categoryCode: 'OUTDOOR',
  modelCode: 'RPUW281X9P',
  coolingW: 78400,
  heatingW: 88000,
  horsepower: 28,
  maxConnections: 40,
  isVrf: true,
  ...over,
})

describe('publishBlockReason — 실외기 계열별 요건', () => {
  it('VRF 실외기는 최대 연결 실내기 수를 요구한다', () => {
    expect(publishBlockReason(outdoor({ maxConnections: null }))).toBe('최대 연결 실내기 수가 없어 게시할 수 없습니다')
  })

  it('비-VRF 실외기(칠러·CDU·단품)는 최대 연결 실내기 수 없이도 게시된다', () => {
    const chiller = outdoor({ modelCode: 'ACAH020LET2', maxConnections: null, isVrf: false, horsepower: 22, heatingW: null })
    expect(publishBlockReason(chiller)).toBeNull()
    expect(canPublish(chiller)).toBe(true)
  })

  it('비-VRF라도 냉방 용량과 마력은 여전히 요구한다', () => {
    expect(publishBlockReason(outdoor({ isVrf: false, maxConnections: null, coolingW: null }))).toBe('냉방 용량이 없어 게시할 수 없습니다')
    expect(publishBlockReason(outdoor({ isVrf: false, maxConnections: null, horsepower: null }))).toBe('마력(HP)이 없어 게시할 수 없습니다')
  })

  it('1HP 미만 소수 마력도 양수이므로 게시된다 (소용량 CDU)', () => {
    const cdu = outdoor({ modelCode: 'LSC-G0100F2', isVrf: false, maxConnections: null, horsepower: 0.34, coolingW: 1000, heatingW: null })
    expect(publishBlockReason(cdu)).toBeNull()
  })

  it('isVrf를 주지 않으면 VRF로 간주해 엄격하게 막는다 (안전측 기본값)', () => {
    const c = { ...outdoor(), maxConnections: null } as PublishCandidate
    delete (c as { isVrf?: boolean }).isVrf
    expect(publishBlockReason(c)).toBe('최대 연결 실내기 수가 없어 게시할 수 없습니다')
  })
})

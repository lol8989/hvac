// 게시 전제조건: PUBLISHED가 되는 순간 생성·검도가 그 스펙을 소비한다.
// 소비측 값객체(IndoorModel/OutdoorUnit)가 요구하는 최소 스펙을 마스터가 먼저 강제한다.
import { describe, it, expect } from 'vitest'
import { publishBlockReason, canPublish, type PublishCandidate } from './Publishability'

const indoor = (over: Partial<PublishCandidate> = {}): PublishCandidate => ({
  categoryCode: 'INDOOR',
  modelCode: 'RNW0401C2S',
  coolingW: 4000,
  heatingW: 4500,
  horsepower: null,
  maxConnections: null,
  ...over,
})

const outdoor = (over: Partial<PublishCandidate> = {}): PublishCandidate => ({
  categoryCode: 'OUTDOOR',
  modelCode: 'RPUW281X9P',
  coolingW: 78400,
  heatingW: 88200,
  horsepower: 28,
  maxConnections: 45,
  ...over,
})

describe('publishBlockReason (게시 전제조건)', () => {
  it('요건을 갖춘 실내기·실외기는 게시할 수 있다', () => {
    expect(publishBlockReason(indoor())).toBeNull()
    expect(publishBlockReason(outdoor())).toBeNull()
    expect(canPublish(outdoor())).toBe(true)
  })

  it('실내기는 냉방·난방 용량이 모두 양수여야 한다(IndoorModel 불변식)', () => {
    expect(publishBlockReason(indoor({ coolingW: null }))).toContain('냉방')
    expect(publishBlockReason(indoor({ heatingW: null }))).toContain('난방')
    expect(publishBlockReason(indoor({ coolingW: 0 }))).toContain('냉방')
  })

  it('실외기는 냉방 용량·마력·최대 연결 실내기 수가 필요하다(OutdoorUnit 불변식)', () => {
    expect(publishBlockReason(outdoor({ coolingW: null }))).toContain('냉방')
    expect(publishBlockReason(outdoor({ horsepower: null }))).toContain('마력')
    expect(publishBlockReason(outdoor({ maxConnections: null }))).toContain('최대 연결')
  })

  it('실외기는 난방 용량이 없어도 게시된다(냉방전용)', () => {
    expect(publishBlockReason(outdoor({ heatingW: null }))).toBeNull()
  })

  it('칠러·CDU처럼 마력이 없는 실외기는 게시가 막힌다', () => {
    const chiller = outdoor({ modelCode: 'ACAH020LET2', horsepower: null, maxConnections: null, heatingW: null })
    expect(canPublish(chiller)).toBe(false)
  })

  it('환기(VENT)는 생성·검도가 소비하지 않으므로 용량 없이도 게시된다', () => {
    const erv: PublishCandidate = {
      categoryCode: 'VENT', modelCode: 'Z-E0100R2AR', coolingW: null, heatingW: null, horsepower: null, maxConnections: null,
    }
    expect(publishBlockReason(erv)).toBeNull()
  })

  it('사유는 사람이 읽을 수 있는 한 문장이다(미리보기 표시용)', () => {
    const reason = publishBlockReason(outdoor({ horsepower: null }))!
    expect(reason.length).toBeGreaterThan(4)
    expect(reason).not.toContain('undefined')
  })
})

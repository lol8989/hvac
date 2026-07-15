import { describe, it, expect } from 'vitest'
import { floorOrder } from './floorOrder'

describe('floorOrder — 층 식별자 정렬 키', () => {
  it('지상 N층은 +N, 지하 N층은 -N', () => {
    expect(floorOrder('지상1층')).toBe(1)
    expect(floorOrder('지상12층')).toBe(12)
    expect(floorOrder('지하1층')).toBe(-1)
    expect(floorOrder('지하2층')).toBe(-2)
  })

  it("'지상/지하' 접두 없는 'N층'은 지상으로 간주한다", () => {
    expect(floorOrder('3층')).toBe(3)
    expect(floorOrder('1층')).toBe(1)
  })

  it('옥탑은 어떤 지상층보다 위다', () => {
    expect(floorOrder('옥탑')).toBeGreaterThan(floorOrder('지상99층'))
    expect(floorOrder('옥탑층')).toBeGreaterThan(floorOrder('지상99층'))
  })

  it('앞뒤 공백을 무시한다', () => {
    expect(floorOrder('  지상2층 ')).toBe(2)
  })

  it('아래→위로 정렬하면 지하가 먼저, 지하는 깊은 층이 먼저다', () => {
    const input = ['지상2층', '지하1층', '옥탑', '지상1층', '지하2층', '10층']
    const sorted = [...input].sort((a, b) => floorOrder(a) - floorOrder(b))
    expect(sorted).toEqual(['지하2층', '지하1층', '지상1층', '지상2층', '10층', '옥탑'])
  })

  it('문자열 정렬로는 깨지는 두 자리 층을 올바로 세운다(지하10층 < 지하2층)', () => {
    expect(floorOrder('지하10층')).toBeLessThan(floorOrder('지하2층'))
    expect(floorOrder('지상10층')).toBeGreaterThan(floorOrder('지상2층'))
  })

  it('식별자 형식이 아니면 맨 뒤로 민다(유한값 아님)', () => {
    expect(floorOrder('로비')).toBe(Number.POSITIVE_INFINITY)
    expect(floorOrder('')).toBe(Number.POSITIVE_INFINITY)
    // 미상 층이 섞여도 정렬이 터지지 않고 뒤로 간다
    const sorted = ['지상1층', '??', '지하1층'].sort((a, b) => floorOrder(a) - floorOrder(b))
    expect(sorted).toEqual(['지하1층', '지상1층', '??'])
  })
})

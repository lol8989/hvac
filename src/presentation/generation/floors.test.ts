import { describe, it, expect } from 'vitest'
import { floorsOf } from './floors'
import { Room } from '../../domain/generation/Room'
import { Polygon } from '../../domain/shared/Polygon'

const mk = (id: string, floor: string): Room =>
  Room.create({ id, floor, name: id, areaM2: 10, usage: '사무실', facility: 'OFFICE', shortSideM: 3, longSideM: 3.3 })

describe('floorsOf — 층별 실 그룹 + bbox 파생', () => {
  it('층별로 실을 묶고 아래→위로 정렬한다', () => {
    const rooms = { A: mk('A', '지상2층'), B: mk('B', '지하1층'), C: mk('C', '지상1층'), D: mk('D', '지상1층') }
    const geom = { A: Polygon.rect(0, 0, 10, 10), B: Polygon.rect(0, 0, 10, 10), C: Polygon.rect(0, 0, 10, 10), D: Polygon.rect(20, 0, 10, 10) }
    const floors = floorsOf(rooms, geom)
    expect(floors.map((f) => f.floor)).toEqual(['지하1층', '지상1층', '지상2층'])
    expect([...floors.find((f) => f.floor === '지상1층')!.roomIds].sort()).toEqual(['C', 'D'])
  })

  it('층 bbox는 그 층 실들의 합집합 bbox다', () => {
    const rooms = { C: mk('C', '지상1층'), D: mk('D', '지상1층') }
    const geom = { C: Polygon.rect(0, 0, 10, 10), D: Polygon.rect(20, 5, 10, 20) }
    const [f] = floorsOf(rooms, geom)
    expect(f.bbox).toEqual({ x: 0, y: 0, w: 30, h: 25 })
  })

  it('다른 층 실은 bbox에 섞이지 않는다(나란히 배치 격리)', () => {
    const rooms = { A: mk('A', '지상1층'), B: mk('B', '지상2층') }
    const geom = { A: Polygon.rect(0, 0, 10, 10), B: Polygon.rect(1000, 1000, 10, 10) }
    const floors = floorsOf(rooms, geom)
    expect(floors.find((f) => f.floor === '지상1층')!.bbox).toEqual({ x: 0, y: 0, w: 10, h: 10 })
  })

  it('형상 없는 실은 roomIds엔 남고 bbox엔 빠진다; 층 전체가 형상 없으면 bbox=null', () => {
    const rooms = { A: mk('A', '지상1층'), B: mk('B', '지상1층'), Z: mk('Z', '지상9층') }
    const geom = { A: Polygon.rect(0, 0, 10, 10) } // B, Z 형상 없음
    const floors = floorsOf(rooms, geom)
    const f1 = floors.find((f) => f.floor === '지상1층')!
    expect([...f1.roomIds].sort()).toEqual(['A', 'B'])
    expect(f1.bbox).toEqual({ x: 0, y: 0, w: 10, h: 10 })
    expect(floors.find((f) => f.floor === '지상9층')!.bbox).toBeNull()
  })

  it('실이 없으면 빈 목록', () => {
    expect(floorsOf({}, {})).toEqual([])
  })
})

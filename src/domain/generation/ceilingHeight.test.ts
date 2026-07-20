import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CEILING_HEIGHT_M,
  SPECIAL_LOAD_MIN_HEIGHT_M,
  intensityForHeight,
  parseCeilingHeight,
  heightForFloor,
  applyCeilingHeights,
} from './ceilingHeight'
import { Room } from './Room'

const room = (id: string, floor: string, usage = '사무실'): Room =>
  Room.create({
    id,
    floor,
    name: usage,
    areaM2: 30,
    usage,
    facility: 'OFFICE',
    shortSideM: 5,
    longSideM: 6,
  })

describe('기본 천정고', () => {
  it('입력이 없으면 3.0m를 쓴다', () => {
    expect(DEFAULT_CEILING_HEIGHT_M).toBe(3.0)
    expect(heightForFloor({}, '지상1층')).toBe(3.0)
  })

  it('층에 값이 있으면 그 값을 쓴다', () => {
    expect(heightForFloor({ 지상1층: 4.5 }, '지상1층')).toBe(4.5)
  })

  it('다른 층의 값이 섞이지 않는다', () => {
    expect(heightForFloor({ 지상1층: 4.5 }, '지상2층')).toBe(3.0)
  })
})

describe('천정고 → 부하강도', () => {
  it('4.0m 이상이면 특수부하다', () => {
    expect(SPECIAL_LOAD_MIN_HEIGHT_M).toBe(4.0)
    expect(intensityForHeight(4.0)).toBe('SPECIAL')
    expect(intensityForHeight(6.0)).toBe('SPECIAL')
  })

  it('4.0m 미만이면 표준부하다', () => {
    expect(intensityForHeight(3.99)).toBe('STANDARD')
    expect(intensityForHeight(3.0)).toBe('STANDARD')
  })
})

describe('천정고 입력 검증', () => {
  it('0 이하·유한하지 않은 값은 거부한다', () => {
    expect(parseCeilingHeight('0').ok).toBe(false)
    expect(parseCeilingHeight('-1').ok).toBe(false)
    expect(parseCeilingHeight('abc').ok).toBe(false)
    expect(parseCeilingHeight('').ok).toBe(false)
  })

  it('실무 범위를 벗어난 값은 거부한다', () => {
    expect(parseCeilingHeight('1.9').ok).toBe(false)
    expect(parseCeilingHeight('20.1').ok).toBe(false)
  })

  it('실무 범위 안의 값은 받는다', () => {
    const r = parseCeilingHeight('4.5')
    expect(r.ok).toBe(true)
    expect(r.ok && r.value).toBe(4.5)
  })
})

describe('천정고 일괄 적용', () => {
  it('4.0m 이상인 층의 실만 특수부하로 바뀐다', () => {
    const rooms = { a: room('a', '지상1층'), b: room('b', '지상2층') }
    const next = applyCeilingHeights(rooms, { 지상1층: 4.5 })

    expect(next.a.intensity).toBe('SPECIAL')
    expect(next.b.intensity).toBe('STANDARD')
  })

  it('특수부하가 되면 단위부하가 올라 필요부하가 커진다', () => {
    const before = room('a', '지상1층')
    const after = applyCeilingHeights({ a: before }, { 지상1층: 5.0 }).a

    expect(after.requiredLoadW.cool).toBeGreaterThan(before.requiredLoadW.cool)
  })

  it('천정고를 되돌리면 부하강도도 되돌아온다', () => {
    const rooms = { a: room('a', '지상1층') }
    const raised = applyCeilingHeights(rooms, { 지상1층: 4.5 })
    const restored = applyCeilingHeights(raised, { 지상1층: 3.0 })

    expect(restored.a.intensity).toBe('STANDARD')
    expect(restored.a.requiredLoadW.cool).toBeCloseTo(rooms.a.requiredLoadW.cool, 6)
  })

  it('사용자가 직접 고친 단위부하는 천정고를 바꿔도 보존된다', () => {
    const edited = room('a', '지상1층').overrideUnitLoad(room('a', '지상1층').effectiveUnitLoad)
    const next = applyCeilingHeights({ a: edited }, { 지상1층: 5.0 }).a

    expect(next.isUnitLoadOverridden).toBe(true)
    expect(next.effectiveUnitLoad.coolKcal).toBe(edited.effectiveUnitLoad.coolKcal)
  })

  it('바뀐 실이 없으면 같은 객체를 그대로 돌려준다', () => {
    const rooms = { a: room('a', '지상1층') }
    expect(applyCeilingHeights(rooms, {})).toBe(rooms)
  })
})

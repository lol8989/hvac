/** @vitest-environment jsdom */
// 실외기 조합 매핑 카드의 조합비 표시 — 선정표와 같은 판정 규칙(judgeCombo + 제품군별 ComboRange)을 쓴다.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import MappingModal from './MappingModal'
import type { GroupView } from '../presentation/generation/planAdapter'
import type { OutdoorModelSpec } from '../application/generation/ports'
import { ComboRange } from '../domain/shared/ComboRange'

const CATALOG: OutdoorModelSpec[] = [
  {
    model: 'RPUW12BX9M', category: '냉난방 절환형', energySource: 'EHP', capacityKw: 34.8, heatKw: 39,
    hp: 12, maxConnections: 16, comboRange: ComboRange.DEFAULT,
  },
]

const grp = (over: Partial<GroupView> = {}): GroupView => ({
  key: 'ODU1', label: '실외기-1', model: 'RPUW12BX9M', cat: '냉난방 절환형', sys: 'EHP',
  cool: 20, items: [], comboMin: 0.5, comboMax: 1.3, ...over,
})

// ROOMS를 직접 참조하는 Chip 때문에 실제 실 id를 쓴다. 용량은 capByRoom으로 주입한다.
const setup = (groups: GroupView[], capByRoom: Record<string, number>) =>
  render(
    <MappingModal
      catalog={CATALOG}
      groups={groups}
      pool={[]}
      capByRoom={capByRoom}
      onMove={vi.fn(() => true)}
      onReplace={vi.fn()}
      onSplit={vi.fn()}
      onAddGroup={vi.fn()}
      onRemove={vi.fn()}
      onClose={vi.fn()}
      onApply={vi.fn()}
    />,
  )

const card = (label: string) => screen.getByText(new RegExp(label)).closest('.odu') as HTMLElement

describe('MappingModal — 카드별 조합비', () => {
  it('조합비와 백분율, 허용 범위를 카드에 표시한다', () => {
    setup([grp({ items: ['AC_001'] })], { AC_001: 10 }) // 10/20 = 0.50
    const c = card('실외기-1')
    expect(within(c).getByText('0.50')).toBeInTheDocument()
    expect(c).toHaveTextContent('(50%)')
    expect(c).toHaveTextContent('허용 0.50~1.30')
  })

  it('허용 범위 안이면 경고 배지가 없다', () => {
    setup([grp({ items: ['AC_001'] })], { AC_001: 16 }) // 0.80
    expect(within(card('실외기-1')).queryByText(/과부하|저부하/)).not.toBeInTheDocument()
  })

  it('상한을 넘으면 과부하 배지를 붙인다', () => {
    setup([grp({ items: ['AC_001'] })], { AC_001: 28 }) // 1.40 > 1.30
    expect(within(card('실외기-1')).getByText('과부하')).toBeInTheDocument()
  })

  it('100%를 넘어도 백분율 라벨은 실제값을 보인다(게이지 바만 100%에서 멈춘다)', () => {
    setup([grp({ items: ['AC_001'] })], { AC_001: 34.2 }) // 1.71 → 171%
    const c = card('실외기-1')
    expect(c).toHaveTextContent('1.71')
    expect(c).toHaveTextContent('(171%)')
    expect(c).not.toHaveTextContent('(100%)')
    expect((c.querySelector('.g > i') as HTMLElement).style.width).toBe('100%')
  })

  it('하한 미만이면 저부하 배지를 붙인다', () => {
    setup([grp({ items: ['AC_001'] })], { AC_001: 8 }) // 0.40 < 0.50
    expect(within(card('실외기-1')).getByText('저부하')).toBeInTheDocument()
  })

  it('제품군별 허용 범위를 따른다 — 상한 1.106인 그룹은 1.05가 정상', () => {
    setup([grp({ items: ['AC_001'], comboMin: 0.5, comboMax: 1.106 })], { AC_001: 21 }) // 1.05
    const c = card('실외기-1')
    expect(c).toHaveTextContent('허용 0.50~1.11')
    expect(within(c).queryByText('과부하')).not.toBeInTheDocument() // 하드코딩 1.3이면 정상, 1.106이어도 정상
  })

  it('제품군별 허용 범위를 따른다 — 상한 1.0인 그룹은 1.05가 과부하', () => {
    setup([grp({ items: ['AC_001'], comboMax: 1.0 })], { AC_001: 21 }) // 1.05 > 1.00
    expect(within(card('실외기-1')).getByText('과부하')).toBeInTheDocument()
  })

  it('실내기가 없는 그룹은 조합비 0이고 경고하지 않는다(빈 그룹은 저부하가 아니다)', () => {
    setup([grp({ items: [] })], {})
    const c = card('실외기-1')
    expect(c).toHaveTextContent('0.00')
    expect(within(c).queryByText(/과부하|저부하/)).not.toBeInTheDocument()
    expect(c).not.toHaveTextContent('허용')
  })
})

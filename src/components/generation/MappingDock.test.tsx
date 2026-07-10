/** @vitest-environment jsdom */
// 실외기 조합 매핑(하단 도크) 카드의 조합비 표시.
// 조합비·판정은 도메인(OutdoorGroup.comboRatio + comboRange)이 계산해 GroupView로 넘어온다.
// 여기서는 그 값이 카드에 그대로 표시되는지(다시 계산하지 않는지)만 검증한다.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import MappingDock from './MappingDock'
import type { DockRoomInfo } from './MappingDock'
import type { GroupView } from '../../presentation/generation/planAdapter'
import type { OutdoorModelSpec } from '../../application/generation/ports'
import { ComboRange } from '../../domain/shared/ComboRange'
import { ComboRatio } from '../../domain/shared/ComboRatio'

const CATALOG: OutdoorModelSpec[] = [
  {
    model: 'RPUW12BX9M', category: '냉난방 절환형', energySource: 'EHP', capacityKw: 34.8, heatKw: 39,
    hp: 12, maxConnections: 16, comboRange: ComboRange.DEFAULT,
  },
]

const ROOM_INFO: Record<string, DockRoomInfo> = {
  AC_001: { name: '거실', type: '4WAY', capKw: 9.0 },
}

// 실외기 20kW에 실내기 정격 indoorKw가 붙은 그룹 — 도메인과 같은 방식으로 ratio/judgement를 계산해 주입한다.
const grp = (indoorKw: number, over: Partial<GroupView> = {}): GroupView => {
  const comboMin = over.comboMin ?? 0.5
  const comboMax = over.comboMax ?? 1.3
  const items = over.items ?? (indoorKw > 0 ? ['AC_001'] : [])
  const ratio = new ComboRatio(indoorKw, 20)
  return {
    key: 'ODU1', label: '실외기-1', model: 'RPUW12BX9M', cat: '냉난방 절환형', sys: 'EHP',
    cool: 20,
    items,
    unitCount: items.length,
    ratio: ratio.value,
    judgement: ratio.judgeWith(new ComboRange(comboMin, comboMax)),
    comboMin,
    comboMax,
    ...over,
  }
}

const setup = (groups: GroupView[], pool: string[] = []) =>
  render(
    <MappingDock
      catalog={CATALOG}
      groups={groups}
      pool={pool}
      roomInfo={ROOM_INFO}
      roomTotal={6}
      height={300}
      onHeightChange={vi.fn()}
      onMove={vi.fn(() => true)}
      onReplace={vi.fn()}
      onSplit={vi.fn()}
      onAddGroup={vi.fn()}
      onRemove={vi.fn()}
      onClose={vi.fn()}
    />,
  )

const card = (label: string) => screen.getByText(new RegExp(label)).closest('.odu') as HTMLElement

describe('MappingDock — 카드별 조합비', () => {
  it('조합비와 백분율, 허용 범위를 카드에 표시한다', () => {
    setup([grp(10)]) // 10/20 = 0.50
    const c = card('실외기-1')
    expect(within(c).getByText('0.50')).toBeInTheDocument()
    expect(c).toHaveTextContent('(50%)')
    expect(c).toHaveTextContent('허용 0.50~1.30')
  })

  it('허용 범위 안이면 경고 배지가 없다', () => {
    setup([grp(16)]) // 0.80
    expect(within(card('실외기-1')).queryByText(/과부하|저부하/)).not.toBeInTheDocument()
  })

  it('상한을 넘으면 과부하 배지를 붙인다', () => {
    setup([grp(28)]) // 1.40 > 1.30
    expect(within(card('실외기-1')).getByText('과부하')).toBeInTheDocument()
  })

  it('100%를 넘어도 백분율 라벨은 실제값을 보인다(게이지 바만 100%에서 멈춘다)', () => {
    setup([grp(34.2)]) // 1.71 → 171%
    const c = card('실외기-1')
    expect(c).toHaveTextContent('1.71')
    expect(c).toHaveTextContent('(171%)')
    expect(c).not.toHaveTextContent('(100%)')
    expect((c.querySelector('.g > i') as HTMLElement).style.width).toBe('100%')
  })

  it('하한 미만이면 저부하 배지를 붙인다', () => {
    setup([grp(8)]) // 0.40 < 0.50
    expect(within(card('실외기-1')).getByText('저부하')).toBeInTheDocument()
  })

  it('제품군별 허용 범위를 따른다 — 상한 1.106인 그룹은 1.05가 정상', () => {
    setup([grp(21, { comboMax: 1.106 })]) // 1.05
    const c = card('실외기-1')
    expect(c).toHaveTextContent('허용 0.50~1.11')
    expect(within(c).queryByText('과부하')).not.toBeInTheDocument()
  })

  it('제품군별 허용 범위를 따른다 — 상한 1.0인 그룹은 1.05가 과부하', () => {
    setup([grp(21, { comboMax: 1.0 })]) // 1.05 > 1.00
    expect(within(card('실외기-1')).getByText('과부하')).toBeInTheDocument()
  })

  it('실내기가 없는 그룹은 조합비 0이고 경고하지 않는다(빈 그룹은 저부하가 아니다)', () => {
    setup([grp(0)])
    const c = card('실외기-1')
    expect(c).toHaveTextContent('0.00')
    expect(within(c).queryByText(/과부하|저부하/)).not.toBeInTheDocument()
    expect(c).not.toHaveTextContent('허용')
  })

  it('연결 수는 실 개수가 아니라 실내기 대수를 보인다', () => {
    // 실 1곳(AC_001)에 실내기 2대가 붙은 그룹
    setup([grp(11.2, { items: ['AC_001'], unitCount: 2 })])
    expect(card('실외기-1')).toHaveTextContent('연결 2대 (1실)')
  })
})

describe('MappingDock — 실 정보는 prop에서 온다 (ROOMS 직접 참조 제거)', () => {
  it('칩에 실명·유형과 설치 정격용량(조합비와 같은 기준)을 보여준다', () => {
    const { container } = setup([grp(9)])
    const chip = container.querySelector('.chip') as HTMLElement
    expect(chip).toHaveTextContent('AC_001')
    expect(chip).toHaveTextContent('거실')
    expect(chip).toHaveTextContent('4WAY')
    expect(chip).toHaveTextContent('9.0kW') // 설계부하가 아니라 정격
  })

  it('미배정 실도 같은 정보로 표시한다', () => {
    const { container } = setup([grp(0)], ['AC_001'])
    const pool = container.querySelector('.pool') as HTMLElement
    expect(within(pool).getByText(/거실/)).toBeInTheDocument()
  })

  it('배정 요약은 전체 실 수를 기준으로 센다', () => {
    const { container } = setup([grp(9)], [])
    expect(container.querySelector('.md-summ')).toHaveTextContent('배정 1/6')
  })

  it('[적대] 실 정보가 없으면 id로 대체하고 0.0kW로 표기한다(빈 화면 대신)', () => {
    const { container } = setup([grp(9, { items: ['AC_999'] })])
    const chip = container.querySelector('.chip') as HTMLElement
    expect(chip).toHaveTextContent('AC_999')
    expect(chip).toHaveTextContent('0.0kW')
  })
})

describe('MappingDock — 도킹 패널이라 도면을 덮지 않는다', () => {
  it('전체화면 오버레이(.overlay)를 쓰지 않는다', () => {
    const { container } = setup([grp(9)])
    expect(container.querySelector('.overlay')).toBeNull()
    expect(container.querySelector('.mapdock')).not.toBeNull()
  })

  it('높이를 prop으로 받는다(드래그로 조절)', () => {
    const { container } = setup([grp(9)])
    expect((container.querySelector('.mapdock') as HTMLElement).style.height).toBe('300px')
  })
})

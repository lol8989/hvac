/** @vitest-environment jsdom */
// 실외기 조합 매핑(하단 도크) — 층 → 실외기 → 실 계층 + 선정 대기.
// 조합비·판정·컬럼값은 도메인(SelectionTable→dockView)이 계산해 넘어온다. 도크는 표시·인터랙션만 검증한다.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import MappingDock from './MappingDock'
import type { DockFloorView, DockGroupView, DockRoomRow } from '../../presentation/generation/dockView'
import type { OutdoorModelSpec } from '../../application/generation/ports'
import { ComboRange } from '../../domain/shared/ComboRange'

const CATALOG: OutdoorModelSpec[] = [
  { model: 'RPUW12BX9M', category: '냉난방 절환형', energySource: 'EHP', capacityKw: 34.8, heatKw: 39, hp: 12, maxConnections: 16, comboRange: ComboRange.DEFAULT },
]

const room = (over: Partial<DockRoomRow> & { roomId: string; name: string }): DockRoomRow => ({
  areaM2: 55, coolKcal: 150, loadKw: 9.6, model: 'RNW0320M2S', qty: 3, ...over,
})

const group = (over: Partial<DockGroupView> = {}): DockGroupView => ({
  key: 'ODU1', label: '실외기-1', model: 'RPUW141XDF', hp: 12, coolKw: 39.2,
  ratio: 0.95, judgement: 'OK', unitCount: 4, roomCount: 2,
  rooms: [room({ roomId: 'AC_005', name: '로비' }), room({ roomId: 'AC_004', name: '사무실', loadKw: 7.2, qty: 1 })],
  ...over,
})

const floor = (over: Partial<DockFloorView> = {}): DockFloorView => ({
  floor: '2F', groups: [group()], unassigned: [], ...over,
})

const setup = (props: Partial<React.ComponentProps<typeof MappingDock>> = {}) =>
  render(
    <MappingDock
      catalog={CATALOG}
      floors={props.floors ?? [floor()]}
      pool={props.pool ?? []}
      roomTotal={props.roomTotal ?? 6}
      selectedRooms={props.selectedRooms ?? []}
      height={props.height ?? 300}
      onHeightChange={props.onHeightChange ?? vi.fn()}
      onSelectRoom={props.onSelectRoom ?? vi.fn()}
      onSelectGroup={props.onSelectGroup ?? vi.fn()}
      onRemove={props.onRemove ?? vi.fn()}
      onEditKcal={props.onEditKcal ?? vi.fn()}
      onMove={props.onMove ?? vi.fn(() => true)}
      onReplace={props.onReplace ?? vi.fn()}
      onClose={props.onClose ?? vi.fn()}
    />,
  )

const card = (label: string) => screen.getByText(new RegExp(label)).closest('.odu') as HTMLElement

describe('MappingDock — 층 → 실외기 → 실 계층', () => {
  it('층 헤더를 보여준다', () => {
    const { container } = setup()
    expect(container.querySelector('.floorhd')).toHaveTextContent('2F')
  })

  it('실외기 카드에 모델·HP·용량·조합비·연결대수를 보여준다', () => {
    setup()
    const c = card('실외기-1')
    expect(c).toHaveTextContent('RPUW141XDF')
    expect(c).toHaveTextContent('12HP')
    expect(c).toHaveTextContent('39.2kW')
    expect(c).toHaveTextContent('0.95')
    expect(c).toHaveTextContent('(95%)')
    expect(c).toHaveTextContent('연결 4대 (2실)')
  })

  it('실 행에 면적·칼로리(편집)·부하·모델·대수 컬럼을 보여준다', () => {
    const { container } = setup()
    const row0 = container.querySelector('.rrow') as HTMLElement
    expect(row0).toHaveTextContent('로비')
    expect(row0).toHaveTextContent('55.0㎡')
    expect(row0).toHaveTextContent('9.6kW') // 부하(kW)는 파생·읽기전용
    expect(row0).toHaveTextContent('RNW0320M2S')
    expect(row0).toHaveTextContent('×3')
    // 칼로리(단위부하)는 편집 가능한 입력(값=150)
    expect((row0.querySelector('.c-kcal .loadin') as HTMLInputElement).value).toBe('150')
  })
})

describe('MappingDock — 단위부하 직접 수정 / 실외기 클릭 하이라이팅', () => {
  it('칼로리 입력을 고치면 그 실 id와 kcal로 onEditKcal을 부른다', () => {
    const onEditKcal = vi.fn()
    const { container } = setup({ onEditKcal })
    const input = container.querySelector('.c-kcal .loadin') as HTMLInputElement
    fireEvent.change(input, { target: { value: '180' } })
    fireEvent.blur(input)
    expect(onEditKcal).toHaveBeenCalledWith('AC_005', 180)
  })

  it('칼로리 입력 클릭은 행 선택(도면 강조)으로 번지지 않는다', () => {
    const onSelectRoom = vi.fn()
    const { container } = setup({ onSelectRoom })
    ;(container.querySelector('.c-kcal .loadin') as HTMLInputElement).click()
    expect(onSelectRoom).not.toHaveBeenCalled()
  })

  it('실외기 헤더를 클릭하면 그 그룹의 모든 실 id로 onSelectGroup을 부른다', () => {
    const onSelectGroup = vi.fn()
    setup({ onSelectGroup })
    ;(card('실외기-1').querySelector('.oh') as HTMLElement).click()
    expect(onSelectGroup).toHaveBeenCalledWith(['AC_005', 'AC_004'])
  })

  it('카드 삭제 버튼을 누르면 그 그룹 key로 onRemove를 부르고, 헤더 선택으로 번지지 않는다', () => {
    const onRemove = vi.fn()
    const onSelectGroup = vi.fn()
    setup({ onRemove, onSelectGroup })
    ;(screen.getByLabelText('실외기-1 삭제') as HTMLElement).click()
    expect(onRemove).toHaveBeenCalledWith('ODU1')
    expect(onSelectGroup).not.toHaveBeenCalled()
  })
})

describe('MappingDock — 조합비 판정 배지', () => {
  it('상한을 넘으면 과부하 배지', () => {
    setup({ floors: [floor({ groups: [group({ ratio: 1.4, judgement: 'OVERLOADED' })] })] })
    expect(within(card('실외기-1')).getByText('과부하')).toBeInTheDocument()
  })
  it('하한 미만이면 저부하 배지', () => {
    setup({ floors: [floor({ groups: [group({ ratio: 0.4, judgement: 'UNDERLOADED' })] })] })
    expect(within(card('실외기-1')).getByText('저부하')).toBeInTheDocument()
  })
  it('정상이면 배지 없음', () => {
    setup({ floors: [floor({ groups: [group({ judgement: 'OK' })] })] })
    expect(within(card('실외기-1')).queryByText(/과부하|저부하/)).not.toBeInTheDocument()
  })
  it('100%를 넘어도 백분율은 실제값, 게이지 바는 100%에서 멈춘다', () => {
    setup({ floors: [floor({ groups: [group({ ratio: 1.71, judgement: 'OVERLOADED' })] })] })
    const c = card('실외기-1')
    expect(c).toHaveTextContent('(171%)')
    expect((c.querySelector('.g > i') as HTMLElement).style.width).toBe('100%')
  })
})

describe('MappingDock — 실 중심: 행 선택 → 도면 하이라이팅', () => {
  it('실 행을 클릭하면 그 실 id로 onSelectRoom을 부른다', () => {
    const onSelectRoom = vi.fn()
    const { container } = setup({ onSelectRoom })
    ;(container.querySelector('.rrow') as HTMLElement).click()
    expect(onSelectRoom).toHaveBeenCalledWith('AC_005')
  })
  it('선택된 실 행은 sel 클래스로 강조된다', () => {
    const { container } = setup({ selectedRooms: ['AC_005'] })
    expect(container.querySelector('.rrow')).toHaveClass('sel')
  })
  it('배정 해제(✕)는 행 선택으로 번지지 않고 onMove(id,pool)을 부른다', () => {
    const onSelectRoom = vi.fn()
    const onMove = vi.fn(() => true)
    setup({ onSelectRoom, onMove })
    ;(screen.getAllByLabelText('배정 해제')[0] as HTMLElement).click()
    expect(onMove).toHaveBeenCalledWith('AC_005', 'pool')
    expect(onSelectRoom).not.toHaveBeenCalled()
  })
})

describe('MappingDock — 분할·삭제 제거 + 미배정 실', () => {
  it('분할·삭제 버튼이 없다', () => {
    setup()
    expect(screen.queryByText('분할')).not.toBeInTheDocument()
    expect(screen.queryByText('삭제')).not.toBeInTheDocument()
  })

  it('도크에는 실외기 선정 버튼이 없다(선정은 도면 오버레이에서 한다)', () => {
    setup()
    expect(screen.queryByText(/실외기 선정/)).not.toBeInTheDocument()
  })

  it('미배정 실을 목록에 보여주고, 클릭하면 onSelectRoom을 부른다', () => {
    const onSelectRoom = vi.fn()
    const { container } = setup({ pool: [room({ roomId: 'AC_002', name: '침실1', qty: 2, loadKw: 4 })], onSelectRoom })
    const chip = container.querySelector('.pool .chip') as HTMLElement
    expect(chip).toHaveTextContent('침실1')
    chip.click()
    expect(onSelectRoom).toHaveBeenCalledWith('AC_002')
  })

  it('배정 요약은 전체 실 수를 기준으로 센다', () => {
    const { container } = setup({ roomTotal: 6 })
    expect(container.querySelector('.md-summ')).toHaveTextContent('배정 2/6')
  })
})

describe('MappingDock — 도킹 패널이라 도면을 덮지 않는다', () => {
  it('전체화면 오버레이(.overlay)를 쓰지 않는다', () => {
    const { container } = setup()
    expect(container.querySelector('.overlay')).toBeNull()
    expect(container.querySelector('.mapdock')).not.toBeNull()
  })
  it('높이를 prop으로 받는다', () => {
    const { container } = setup({ height: 300 })
    expect((container.querySelector('.mapdock') as HTMLElement).style.height).toBe('300px')
  })
})

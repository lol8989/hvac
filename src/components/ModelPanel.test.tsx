/** @vitest-environment jsdom */
// 우측 모델 선택 패널 — 장비마스터 게시본(수백 종)을 검색·필터로 좁혀 쓴다.
// 필터링해도 '모델 적용'이 쓰는 선택 인덱스는 원본 배열 기준이어야 한다.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ModelPanel from './ModelPanel'
import type { ModelCard, Room } from '../data'

const outCards: ModelCard[] = [
  { mn: 'RPUW08BX9E', ms: '냉난방 절환형 · 냉방 22.4kW · 8HP', md: '최대 연결 13대', on: false, cool: 22.4, kind: '냉난방 절환형', sys: 'EHP', heat: 25.1, series: 'Multi V Super 5(고급형)' },
  { mn: 'RPUW12BX9M', ms: '냉난방 절환형 · 냉방 34.8kW · 12HP', md: '최대 연결 20대', on: false, cool: 34.8, kind: '냉난방 절환형', sys: 'EHP', heat: 39.2, series: 'Multi V i(슈프림)' },
  { mn: 'GPUW280C2S', ms: 'GHP · 냉방 82.0kW · 28HP', md: '최대 연결 53대', on: false, cool: 82, kind: 'GHP', sys: 'GHP', heat: 90, series: 'GHP Super III' },
  { mn: 'RWUW080C9S', ms: '수냉식 · 냉방 22.4kW · 8HP', md: '최대 연결 13대', on: false, cool: 22.4, kind: '수냉식', sys: '수냉식', heat: 25.1, series: 'Multi V Water IV' },
  { mn: 'RPUQ141X9S', ms: '냉방전용 · 냉방 39.2kW · 14HP', md: '최대 연결 23대', on: false, cool: 39.2, kind: '냉방전용', sys: 'EHP', heat: null, series: 'Multi V Super 5(일반형_냉전)' },
]

const inCards: ModelCard[] = [
  { mn: 'RNW0401C2S', ms: '4WAY 카세트 · 냉방 4.0kW', md: '', on: false, cool: 4, kind: '4WAY 카세트', series: 'Multi V 실내기(민수전용)' },
  { mn: 'RNW1101A2U', ms: '덕트 · 냉방 11.0kW', md: '', on: false, cool: 11, kind: '덕트', series: 'Multi V 실내기(조달전용)' },
]

const ROOMS_FX: Record<string, Room> = {}

function setup(over: Partial<React.ComponentProps<typeof ModelPanel>> = {}) {
  const onSelectModel = vi.fn()
  const setTab = vi.fn()
  render(
    <ModelPanel
      rooms={ROOMS_FX}
      groups={[]}
      selRooms={[]}
      tab="out"
      setTab={setTab}
      models={{ in: inCards, out: outCards }}
      open
      width={320}
      onToggle={vi.fn()}
      onWidthChange={vi.fn()}
      onSelectRoom={vi.fn()}
      onFocusRoom={vi.fn()}
      selModelIdx={-1}
      onSelectModel={onSelectModel}
      onApply={vi.fn()}
      indoorByRoom={{}}
      aiRooms={new Set()}
      {...over}
    />,
  )
  return { onSelectModel, setTab }
}

const cards = () => screen.getAllByRole('button').filter((b) => b.className.includes('mcard'))
const countLabel = () => screen.getByText(/\d+ \/ \d+건/).textContent

// 검색은 버튼(또는 Enter) 제출로만 반영된다 — 서버 조회 전환 시 타이핑마다 쿼리가 나가지 않도록.
const search = (text: string) => {
  fireEvent.change(screen.getByLabelText('모델 검색'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: '검색' }))
}

describe('ModelPanel — 목록 검색·필터', () => {
  it('전체 모델과 건수를 보여준다', () => {
    setup()
    expect(cards()).toHaveLength(5)
    expect(countLabel()).toBe('5 / 5건')
  })

  it('타이핑만으로는 목록이 바뀌지 않고, 검색 버튼을 눌러야 반영된다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('모델 검색'), { target: { value: 'GPUW' } })
    expect(cards()).toHaveLength(5) // 아직 제출 전
    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(cards()).toHaveLength(1)
  })

  it('Enter로도 검색이 제출된다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('모델 검색'), { target: { value: 'GPUW' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(cards()).toHaveLength(1)
  })

  it('모델명으로 검색한다', () => {
    setup()
    search('GPUW')
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]).getByText('GPUW280C2S')).toBeInTheDocument()
    expect(countLabel()).toBe('1 / 5건')
  })

  it('사양 문자열로도 검색한다(대소문자 무시)', () => {
    setup()
    search('28hp')
    expect(cards()).toHaveLength(1)
  })

  it('검색어를 비우고 다시 검색하면 전체로 돌아온다', () => {
    setup()
    search('GPUW')
    search('')
    expect(cards()).toHaveLength(5)
  })

  it('실외기 탭에서는 계열 필터를 제공한다(즉시 적용)', () => {
    setup()
    const select = screen.getByLabelText('계열 필터')
    expect(within(select).getByText('전체 계열')).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'GHP' } })
    expect(cards()).toHaveLength(1)
    expect(countLabel()).toBe('1 / 5건')
  })

  it('실외기 냉난방 구분 필터 — 냉방전용만 남긴다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('냉난방 구분 필터'), { target: { value: 'COOL_ONLY' } })
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]).getByText('RPUQ141X9S')).toBeInTheDocument()
  })

  it('실외기 냉난방 구분 필터 — 냉난방만 남긴다(난방용량 있는 모델)', () => {
    setup()
    fireEvent.change(screen.getByLabelText('냉난방 구분 필터'), { target: { value: 'HEAT' } })
    expect(cards()).toHaveLength(4)
  })

  it('계열 + 냉난방 구분 + 검색이 함께 적용된다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('계열 필터'), { target: { value: 'EHP' } })
    fireEvent.change(screen.getByLabelText('냉난방 구분 필터'), { target: { value: 'COOL_ONLY' } })
    expect(cards()).toHaveLength(1)
    search('RPUQ')
    expect(cards()).toHaveLength(1)
    search('GPUW')
    expect(cards()).toHaveLength(0)
  })

  it('실내기 탭에는 냉난방 구분 필터가 없다', () => {
    setup({ tab: 'in' })
    expect(screen.queryByLabelText('냉난방 구분 필터')).not.toBeInTheDocument()
  })

  it('실내기 탭에서는 유형 필터를 제공한다', () => {
    setup({ tab: 'in' })
    const select = screen.getByLabelText('유형 필터')
    fireEvent.change(select, { target: { value: '덕트' } })
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]).getByText('RNW1101A2U')).toBeInTheDocument()
  })


  it('시리즈 필터로 좁힌다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('시리즈 필터'), { target: { value: 'GHP Super III' } })
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]).getByText('GPUW280C2S')).toBeInTheDocument()
  })

  it('시리즈 선택지는 앞선 필터(계열)를 반영해 좁혀진다', () => {
    setup()
    const seriesSel = () => screen.getByLabelText('시리즈 필터') as HTMLSelectElement
    expect([...seriesSel().options]).toHaveLength(6) // 전체 + 5개 시리즈
    fireEvent.change(screen.getByLabelText('계열 필터'), { target: { value: 'GHP' } })
    expect([...seriesSel().options].map((o) => o.textContent)).toEqual(['전체 시리즈', 'GHP Super III'])
  })

  it('시리즈 선택지는 냉난방 구분 필터도 반영한다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('냉난방 구분 필터'), { target: { value: 'COOL_ONLY' } })
    const seriesSel = screen.getByLabelText('시리즈 필터') as HTMLSelectElement
    expect([...seriesSel.options].map((o) => o.textContent)).toEqual(['전체 시리즈', 'Multi V Super 5(일반형_냉전)'])
  })

  it('카드에 시리즈명을 함께 표기한다', () => {
    setup()
    expect(within(cards()[0]).getByText(/Multi V Super 5\(고급형\)/)).toBeInTheDocument()
  })

  it('실내기 카드에도 시리즈명이 표기되고 시리즈 필터가 동작한다', () => {
    setup({ tab: 'in' })
    expect(within(cards()[0]).getByText(/Multi V 실내기\(민수전용\)/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('시리즈 필터'), { target: { value: 'Multi V 실내기(조달전용)' } })
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]).getByText('RNW1101A2U')).toBeInTheDocument()
  })

  it('탭을 바꾸면 시리즈 필터도 초기화된다', () => {
    setup()
    fireEvent.change(screen.getByLabelText('시리즈 필터'), { target: { value: 'GHP Super III' } })
    expect(cards()).toHaveLength(1)
  })

  it('결과가 없으면 빈 상태를 안내한다', () => {
    setup()
    search('ZZZZZ')
    expect(cards()).toHaveLength(0)
    expect(screen.getByText('조건에 맞는 모델이 없습니다')).toBeInTheDocument()
  })

  it('필터링해도 선택 인덱스는 원본 배열 기준이다', () => {
    const { onSelectModel } = setup()
    fireEvent.change(screen.getByLabelText('계열 필터'), { target: { value: 'GHP' } })
    fireEvent.click(cards()[0]) // 화면상 첫 카드지만 원본에서는 index 2
    expect(onSelectModel).toHaveBeenCalledWith(2)
  })

  it('선택된 카드에만 "선택됨" 뱃지가 붙는다(필터 이후에도 유지)', () => {
    setup({ selModelIdx: 2 })
    fireEvent.change(screen.getByLabelText('계열 필터'), { target: { value: 'GHP' } })
    expect(within(cards()[0]).getByText('선택됨')).toBeInTheDocument()
  })

})

describe('ModelPanel — 탭 전환 시 필터 초기화', () => {
  it('out → in 전환 시 이전 계열 필터가 남지 않는다', () => {
    const { rerender } = render(
      <ModelPanel
        rooms={ROOMS_FX} groups={[]} selRooms={[]} tab="out" setTab={vi.fn()}
        models={{ in: inCards, out: outCards }} open width={320} onToggle={vi.fn()} onWidthChange={vi.fn()}
        onSelectRoom={vi.fn()} onFocusRoom={vi.fn()} selModelIdx={-1} onSelectModel={vi.fn()} onApply={vi.fn()}
        indoorByRoom={{}} aiRooms={new Set()}
      />,
    )
    fireEvent.change(screen.getByLabelText('계열 필터'), { target: { value: 'GHP' } })
    expect(screen.getByText('1 / 5건')).toBeInTheDocument()

    rerender(
      <ModelPanel
        rooms={ROOMS_FX} groups={[]} selRooms={[]} tab="in" setTab={vi.fn()}
        models={{ in: inCards, out: outCards }} open width={320} onToggle={vi.fn()} onWidthChange={vi.fn()}
        onSelectRoom={vi.fn()} onFocusRoom={vi.fn()} selModelIdx={-1} onSelectModel={vi.fn()} onApply={vi.fn()}
        indoorByRoom={{}} aiRooms={new Set()}
      />,
    )
    expect(screen.getByText('2 / 2건')).toBeInTheDocument() // 필터 초기화 → 실내기 전량
  })
})

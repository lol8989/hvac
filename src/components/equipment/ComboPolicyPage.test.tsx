/** @vitest-environment jsdom */
// 조합비 정책 화면 — 전역 기본 + 실외기 모델별 override + 필터 (주인님 지시 2026-07-10).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ComboPolicyPage from './ComboPolicyPage'
import type { EquipmentAdminRepository, ProductRow } from '../../application/equipment/adminPorts'
import { ComboPolicy } from '../../domain/equipment/ComboPolicy'
import { ComboRange } from '../../domain/shared/ComboRange'

const mk = (over: Partial<ProductRow>): ProductRow => ({
  id: 0, categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형', energySource: 'EHP',
  seriesCode: 'S_EHP', seriesName: 'Multi V Super 5', modelCode: 'M', equipmentCode: null, horsepower: 10, hpSource: 'MODEL_CODE',
  coolingW: 20000, heatingW: 22000, maxConnections: 16, status: 'PUBLISHED',
  createdAt: null, updatedAt: null, publishedAt: null, ...over,
})

const ROWS: ProductRow[] = [
  mk({ id: 1, modelCode: 'EHP_A' }),
  mk({ id: 2, modelCode: 'EHP_B', status: 'DRAFT' }),
  mk({ id: 3, modelCode: 'GHP_A', energySource: 'GHP', seriesCode: 'S_GHP', seriesName: 'GHP Super III' }),
  mk({ id: 4, modelCode: 'INDOOR_X', categoryCode: 'INDOOR' }), // 실외기가 아니므로 목록에서 제외
]

let policy = new ComboPolicy(ComboRange.DEFAULT, new Map([['GHP_A', new ComboRange(0.5, 1.12)]]))

const makeAdmin = (over: Partial<EquipmentAdminRepository> = {}): EquipmentAdminRepository => ({
  listProducts: () => ROWS,
  listSeries: () => [],
  createProduct: vi.fn(() => 1),
  updateProduct: vi.fn(),
  setStatus: vi.fn(),
  setStatusMany: vi.fn(() => ({ applied: 0, skipped: [] })),
  importProducts: vi.fn(() => 0),
  getComboPolicy: () => policy,
  saveGlobalComboRange: vi.fn(),
  setProductComboRange: vi.fn(),
  ...over,
})

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const models = () => bodyRows().map((r) => within(r).getAllByRole('cell')[0].textContent)
const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => {
  vi.clearAllMocks()
  policy = new ComboPolicy(ComboRange.DEFAULT, new Map([['GHP_A', new ComboRange(0.5, 1.12)]]))
})

describe('ComboPolicyPage — 목록', () => {
  it('실외기만 보여준다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    expect(models()).toEqual(['EHP_A', 'EHP_B', 'GHP_A'])
  })

  it('전역 기본을 따르는 모델과 예외가 걸린 모델을 구분해 표기한다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    const ghp = bodyRows().find((r) => within(r).queryByText('GHP_A'))!
    expect(within(ghp).getByText('모델별 예외')).toBeInTheDocument()
    expect(within(ghp).getByText('112%')).toBeInTheDocument()

    const ehp = bodyRows().find((r) => within(r).queryByText('EHP_A'))!
    expect(within(ehp).getByText('전역 기본')).toBeInTheDocument()
    expect(within(ehp).getByText('103%')).toBeInTheDocument()
  })
})

describe('ComboPolicyPage — 필터', () => {
  it('계열로 좁힌다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    pick('계열 필터', 'GHP')
    expect(models()).toEqual(['GHP_A'])
  })

  it('상태로 좁힌다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    pick('상태 필터', 'DRAFT')
    expect(models()).toEqual(['EHP_B'])
  })

  // 이 화면 고유의 축 — "기본값에서 벗어난 실외기가 무엇인가"가 첫 질문이다.
  it('적용 출처로 모델별 예외만 추린다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    pick('적용 출처 필터', 'OVERRIDE')
    expect(models()).toEqual(['GHP_A'])
    pick('적용 출처 필터', 'GLOBAL')
    expect(models()).toEqual(['EHP_A', 'EHP_B'])
  })

  it('시리즈 선택지는 고른 계열의 것만 낸다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    pick('계열 필터', 'GHP')
    const opts = within(screen.getByLabelText('시리즈 필터')).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['전체 시리즈', 'GHP Super III'])
  })

  // 검색은 입력할 때가 아니라 버튼(또는 Enter)으로 확정한다.
  it('검색 버튼을 눌러야 걸러지고, 모델명과 시리즈명을 함께 훑는다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    fireEvent.change(screen.getByLabelText('실외기 모델명·시리즈 검색'), { target: { value: 'super iii' } })
    expect(models()).toEqual(['EHP_A', 'EHP_B', 'GHP_A']) // 아직 그대로

    fireEvent.click(screen.getByRole('button', { name: '검색' }))
    expect(models()).toEqual(['GHP_A'])
  })

  it('초기화는 필터가 걸렸을 때만 활성화되고, 누르면 전 조건이 풀린다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    const reset = () => screen.getByRole('button', { name: '초기화' })
    expect(reset()).toBeDisabled()
    pick('계열 필터', 'GHP')
    expect(reset()).toBeEnabled()
    fireEvent.click(reset())
    expect(models()).toEqual(['EHP_A', 'EHP_B', 'GHP_A'])
  })
})

describe('ComboPolicyPage — 저장', () => {
  it('모델별 예외를 저장한다 (게시본도 조정 가능)', () => {
    const admin = makeAdmin()
    render(<ComboPolicyPage admin={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'EHP_A 조합비 편집' }))
    fireEvent.change(screen.getByLabelText('EHP_A 상한(%)'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'EHP_A 저장' }))

    expect(admin.setProductComboRange).toHaveBeenCalledWith('EHP_A', new ComboRange(0.5, 0.9))
  })

  it('기본값으로 되돌리면 override를 걷어낸다(null)', () => {
    const admin = makeAdmin()
    render(<ComboPolicyPage admin={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'GHP_A 기본값으로' }))
    expect(admin.setProductComboRange).toHaveBeenCalledWith('GHP_A', null)
  })

  it('예외가 없는 모델의 “기본값으로”는 비활성이다', () => {
    render(<ComboPolicyPage admin={makeAdmin()} />)
    expect(screen.getByRole('button', { name: 'EHP_A 기본값으로' })).toBeDisabled()
  })

  it('전역 기본을 저장한다', () => {
    const admin = makeAdmin()
    render(<ComboPolicyPage admin={admin} />)
    fireEvent.change(screen.getByLabelText('전역 상한(%)'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: '전역 기본 저장' }))
    expect(admin.saveGlobalComboRange).toHaveBeenCalledWith(new ComboRange(0.5, 1.0))
  })

  it('하한이 상한보다 크면 저장하지 않고 사유를 보여준다', () => {
    const admin = makeAdmin()
    render(<ComboPolicyPage admin={admin} />)
    fireEvent.change(screen.getByLabelText('전역 하한(%)'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: '전역 기본 저장' }))
    expect(admin.saveGlobalComboRange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('min < max')
  })
})

/** @vitest-environment jsdom */
// 실내외기 조합관리 화면 — 실외기 시리즈 마스터·디테일.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CompatMatrixPage from './CompatMatrixPage'
import type { EquipmentAdminRepository } from '../../application/equipment/adminPorts'
import { compatMatrixFromSeed } from '../../infrastructure/equipment/seed/compatMatrixFromSeed'
import { CompatMatrix } from '../../domain/equipment/CompatMatrix'

const makeAdmin = (over: Partial<EquipmentAdminRepository> = {}): EquipmentAdminRepository =>
  ({
    listProducts: () => [],
    listSeries: () => [],
    createProduct: vi.fn(() => 1),
    updateProduct: vi.fn(),
    setStatus: vi.fn(),
    setStatusMany: vi.fn(() => ({ applied: 0, skipped: [] })),
    importProducts: vi.fn(() => 0),
    getComboPolicy: vi.fn(),
    saveGlobalComboRange: vi.fn(),
    setProductComboRange: vi.fn(),
    getCompatMatrix: () => compatMatrixFromSeed(),
    setCompatCell: vi.fn(),
    clearCompatForOutdoor: vi.fn(),
    ...over,
  }) as EquipmentAdminRepository

beforeEach(() => vi.clearAllMocks())

describe('CompatMatrixPage — 마스터·디테일', () => {
  it('기본으로 냉난방 절환형 실외기를 열고, 연결 가능한 실내기가 체크돼 보인다', () => {
    render(<CompatMatrixPage admin={makeAdmin()} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Multi V')
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes.length).toBeGreaterThan(0)
    expect(boxes.some((b) => b.checked)).toBe(true) // 절환형은 다수 실내기가 연결 가능
  })

  it('좌측 목록에서 다른 시리즈를 고르면 디테일이 바뀐다', () => {
    render(<CompatMatrixPage admin={makeAdmin()} />)
    fireEvent.click(screen.getByRole('button', { name: /GHP Super III/ }))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('GHP Super III')
  })

  it('체크박스를 끄면 setCompatCell(…, X)를 호출한다', () => {
    const setCompatCell = vi.fn()
    render(<CompatMatrixPage admin={makeAdmin({ setCompatCell })} />)
    fireEvent.click(screen.getByRole('button', { name: /GHP Super III/ }))
    // GHP는 대공간덕트만 연결 가능(체크됨) → 끄면 X
    const bigDuct = screen.getByRole('checkbox', { name: /대공간덕트/ }) as HTMLInputElement
    expect(bigDuct.checked).toBe(true)
    fireEvent.click(bigDuct)
    expect(setCompatCell).toHaveBeenLastCalledWith(
      expect.objectContaining({ series: 'GHP Super III' }),
      expect.objectContaining({ series: 'Multi V 실내기(대공간덕트)' }),
      'X',
    )
  })

  it('멀티 조합 대상이 아닌(전부 -) 실외기는 안내문을 보여준다', () => {
    // 시드엔 전부 '-'인 행이 없어 손으로 만든 매트릭스로 빈 상태 분기를 검증한다.
    const solo = new CompatMatrix(
      [{ energySource: 'Chiller', subcategory: '공랭식 칠러', series: 'Air-Cooled Chiller' }],
      [{ energySource: 'EHP', subcategory: '4WAY 카세트', series: '민수전용' }],
      ['-'],
    )
    render(<CompatMatrixPage admin={makeAdmin({ getCompatMatrix: () => solo })} />)
    expect(screen.getByText(/멀티.*조합 대상이 아닙니다/)).toBeTruthy()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('확정 기본값 복원 버튼은 clearCompatForOutdoor를 호출한다', () => {
    const clearCompatForOutdoor = vi.fn()
    render(<CompatMatrixPage admin={makeAdmin({ clearCompatForOutdoor })} />)
    fireEvent.click(screen.getByRole('button', { name: '확정 기본값 복원' }))
    expect(clearCompatForOutdoor).toHaveBeenCalledWith(expect.objectContaining({ series: expect.any(String) }))
  })

  it('검색으로 실외기 시리즈를 좁힌다', () => {
    render(<CompatMatrixPage admin={makeAdmin()} />)
    fireEvent.change(screen.getByLabelText('실외기 시리즈·중분류 검색'), { target: { value: 'GHP Super' } })
    expect(screen.getByRole('button', { name: /GHP Super III/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Water-Cooled Scroll Chiller/ })).toBeNull()
  })
})

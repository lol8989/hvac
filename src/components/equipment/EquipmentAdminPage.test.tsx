/** @vitest-environment jsdom */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import EquipmentAdminPage from './EquipmentAdminPage'
import type { ProductRow, EquipmentAdminRepository } from '../../application/equipment/adminPorts'

const mk = (over: Partial<ProductRow>): ProductRow => ({
  id: 0, categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형', energySource: 'EHP',
  seriesName: 'S', modelCode: 'M', equipmentCode: null, horsepower: 10, coolingW: 20000, heatingW: 22000,
  status: 'PUBLISHED', priceKrw: 1000000, ...over,
})

// 15개(게시 13 + 작성중 1 + 보관 1) → 페이지네이션(12/페이지) 2페이지.
const rows: ProductRow[] = [
  ...Array.from({ length: 13 }, (_, i) => mk({ id: i + 1, modelCode: `PUB${i}`, status: 'PUBLISHED' })),
  mk({ id: 100, categoryCode: 'INDOOR', categoryName: '실내기', subcategoryName: '4WAY 카세트', modelCode: 'DRAFTX', equipmentCode: '40C', status: 'DRAFT', priceKrw: null, horsepower: null }),
  mk({ id: 101, modelCode: 'ARCHX', status: 'ARCHIVED' }),
]
const admin: EquipmentAdminRepository = { listProducts: () => rows }
const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1) // skip header

describe('EquipmentAdminPage (관리 목록)', () => {
  it('전 상태 요약과 상태 뱃지를 렌더한다', () => {
    render(<EquipmentAdminPage admin={admin} />)
    expect(screen.getByText(/게시 13 · 작성중 1 · 보관 1/)).toBeInTheDocument()
    expect(screen.getAllByText('게시').length).toBeGreaterThan(0)
  })

  it('첫 페이지에 12행, 페이지네이션으로 다음 페이지 이동', () => {
    render(<EquipmentAdminPage admin={admin} />)
    expect(bodyRows()).toHaveLength(12)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '다음 →' }))
    expect(bodyRows()).toHaveLength(3) // 15 - 12
  })

  it('상태 필터(작성중)로 DRAFT만 남는다', () => {
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'DRAFT' } })
    const r = bodyRows()
    expect(r).toHaveLength(1)
    expect(within(r[0]).getByText('DRAFTX')).toBeInTheDocument()
    expect(within(r[0]).getByText('작성중')).toBeInTheDocument()
  })

  it('분류 필터(실내기)로 INDOOR만 남는다', () => {
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.change(screen.getByRole('combobox', { name: '분류 필터' }), { target: { value: 'INDOOR' } })
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByText('DRAFTX')).toBeInTheDocument()
  })

  it('검색으로 모델명 필터, 0건이면 빈 상태 안내', () => {
    render(<EquipmentAdminPage admin={admin} />)
    const search = screen.getByPlaceholderText('모델명·장비번호 검색')
    fireEvent.change(search, { target: { value: 'ARCHX' } })
    expect(bodyRows()).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'ZZZNONE' } })
    expect(screen.getByText('조건에 맞는 제품이 없습니다')).toBeInTheDocument()
  })
})

/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import EquipmentAdminPage from './EquipmentAdminPage'
import type { ProductRow, EquipmentAdminRepository, SeriesOption } from '../../application/equipment/adminPorts'
import { EquipmentDomainError } from '../../domain/equipment/errors'

const mk = (over: Partial<ProductRow>): ProductRow => ({
  id: 0, categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형', energySource: 'EHP',
  seriesCode: 'S_OUT_HR', seriesName: 'S', modelCode: 'M', equipmentCode: null, horsepower: 10, hpSource: 'MODEL_CODE',
  coolingW: 20000, heatingW: 22000, maxConnections: 16, status: 'PUBLISHED',
  createdAt: null, updatedAt: null, publishedAt: null, ...over,
})

// 15개(게시 13 + 작성중 1 + 보관 1) → 페이지네이션(12/페이지) 2페이지.
const rows: ProductRow[] = [
  ...Array.from({ length: 13 }, (_, i) => mk({ id: i + 1, modelCode: `PUB${i}`, status: 'PUBLISHED', publishedAt: '2026-07-01T12:00:00' })),
  mk({ id: 100, categoryCode: 'INDOOR', categoryName: '실내기', subcategoryName: '4WAY 카세트', seriesCode: 'S_IN_4WAY', modelCode: 'DRAFTX', equipmentCode: '40C', status: 'DRAFT', horsepower: null, maxConnections: null, createdAt: '2026-07-08T09:05:03', updatedAt: '2026-07-09T10:11:12' }),
  mk({ id: 101, modelCode: 'ARCHX', status: 'ARCHIVED' }),
]

const SERIES: SeriesOption[] = [
  { code: 'S_IN_4WAY', nameKo: 'Multi V 실내기 4WAY', categoryCode: 'INDOOR', categoryName: '실내기', subcategoryName: '4WAY 카세트', energySource: 'EHP', isVrf: false },
  { code: 'S_OUT_HR', nameKo: 'Multi V Super 절환형', categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형', energySource: 'EHP', isVrf: true },
]

// 목록은 스텁 배열을 그대로 돌려주고, 쓰기는 스파이로 관찰한다(저장소 계약은 SQLite 테스트가 담당).
const makeAdmin = (over: Partial<EquipmentAdminRepository> = {}): EquipmentAdminRepository => ({
  listProducts: () => rows,
  listSeries: () => SERIES,
  createProduct: vi.fn(() => 1),
  updateProduct: vi.fn(),
  setStatus: vi.fn(),
  setStatusMany: vi.fn(() => ({ applied: 0, skipped: [] })),
  importProducts: vi.fn(() => 0),
  ...over,
})

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1) // skip header
const openCreateForm = () => fireEvent.click(screen.getByRole('button', { name: '＋ 제품 등록' }))
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

beforeEach(() => vi.clearAllMocks())

describe('EquipmentAdminPage (관리 목록)', () => {
  it('전 상태 요약과 상태 뱃지를 렌더한다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    expect(screen.getByText(/게시 13 · 작성중 1 · 단종 1/)).toBeInTheDocument()
    expect(screen.getAllByText('게시').length).toBeGreaterThan(0)
  })

  it('한 페이지에 최대 20행을 보여준다(15행이면 1페이지)', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    expect(bodyRows()).toHaveLength(15)
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  describe('표시 건수 드롭다운', () => {
    // 25행 → 기본 20건이면 2페이지, 30건으로 늘리면 1페이지.
    const many = Array.from({ length: 25 }, (_, i) => mk({ id: i + 1, modelCode: `M${i}` }))
    const renderMany = () => render(<EquipmentAdminPage admin={makeAdmin({ listProducts: () => many })} />)
    const sizeSelect = () => screen.getByLabelText('표시 건수')

    it('기본값은 20건이다', () => {
      renderMany()
      expect(sizeSelect()).toHaveValue('20')
      expect(bodyRows()).toHaveLength(20)
      expect(screen.getByText('1 / 2')).toBeInTheDocument()
    })

    it('20 · 30 · 50 · 100건을 선택할 수 있다', () => {
      renderMany()
      const values = within(sizeSelect()).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
      expect(values).toEqual(['20', '30', '50', '100'])
    })

    it('건수를 늘리면 그만큼 더 보여준다', () => {
      renderMany()
      fireEvent.change(sizeSelect(), { target: { value: '30' } })
      expect(bodyRows()).toHaveLength(25)
      expect(screen.getByText('1 / 1')).toBeInTheDocument()
    })

    it('건수를 바꾸면 첫 페이지로 되돌아간다', () => {
      renderMany()
      fireEvent.click(screen.getByRole('button', { name: '다음 →' }))
      expect(screen.getByText('2 / 2')).toBeInTheDocument()
      fireEvent.change(sizeSelect(), { target: { value: '30' } })
      expect(screen.getByText('1 / 1')).toBeInTheDocument()
    })
  })

  it('상태 필터(작성중)로 DRAFT만 남는다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'DRAFT' } })
    const r = bodyRows()
    expect(r).toHaveLength(1)
    expect(within(r[0]).getByText('DRAFTX')).toBeInTheDocument()
    expect(within(r[0]).getByText('작성중')).toBeInTheDocument()
  })

  it('분류 필터(실내기)로 INDOOR만 남는다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    fireEvent.change(screen.getByRole('combobox', { name: '분류 필터' }), { target: { value: 'INDOOR' } })
    expect(bodyRows()).toHaveLength(1)
    expect(screen.getByText('DRAFTX')).toBeInTheDocument()
  })

  it('등록일·수정일·게시일을 YYYY-MM-DD HH:mm:ss로 표기한다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    for (const h of ['등록일', '수정일', '게시일']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
    const draftRow = bodyRows().find((r) => within(r).queryByText('DRAFTX'))!
    expect(within(draftRow).getByText('2026-07-08 09:05:03')).toBeInTheDocument() // 등록일
    expect(within(draftRow).getByText('2026-07-09 10:11:12')).toBeInTheDocument() // 수정일
    const pubRow = bodyRows().find((r) => within(r).queryByText('PUB0'))!
    expect(within(pubRow).getByText('2026-07-01 12:00:00')).toBeInTheDocument() // 게시일
  })

  it('검색으로 모델명 필터, 0건이면 빈 상태 안내', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    const search = screen.getByPlaceholderText('모델명·장비번호 검색')
    fireEvent.change(search, { target: { value: 'ARCHX' } })
    expect(bodyRows()).toHaveLength(1)
    fireEvent.change(search, { target: { value: 'ZZZNONE' } })
    expect(screen.getByText('조건에 맞는 제품이 없습니다')).toBeInTheDocument()
  })
})

describe('행 액션 (게시 전이 · 게시본 잠금)', () => {
  it('상태별로 허용된 전이 버튼만 노출한다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    expect(screen.getByRole('button', { name: 'PUB0 단종' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'PUB0 게시' })).not.toBeInTheDocument() // 이미 게시
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'DRAFT' } })
    expect(screen.queryByRole('button', { name: 'DRAFTX 게시' })).not.toBeInTheDocument() // 게시는 일괄 게시로만
    expect(screen.getByRole('button', { name: 'DRAFTX 등록 취소' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'ARCHIVED' } })
    expect(screen.getByRole('button', { name: 'ARCHX 재게시' })).toBeInTheDocument()
  })

  it('게시·보관본의 수정 버튼은 비활성이고, 작성중만 수정할 수 있다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    expect(screen.getByRole('button', { name: 'PUB0 수정' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'ARCHIVED' } })
    expect(screen.getByRole('button', { name: 'ARCHX 수정' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'DRAFT' } })
    expect(screen.getByRole('button', { name: 'DRAFTX 수정' })).toBeEnabled()
  })

  it('재게시 버튼 클릭 시 setStatus(PUBLISHED)를 호출하고 완료 토스트를 띄운다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'ARCHIVED' } })
    fireEvent.click(screen.getByRole('button', { name: 'ARCHX 재게시' }))
    expect(admin.setStatus).toHaveBeenCalledWith(101, 'PUBLISHED')
    expect(screen.getByRole('status')).toHaveTextContent('ARCHX — 재게시 완료')
  })

  it('저장소가 도메인 예외를 던지면 토스트로 사유를 알린다', () => {
    const admin = makeAdmin({
      setStatus: vi.fn(() => {
        throw new EquipmentDomainError('INVALID_TRANSITION', '허용되지 않은 상태 전이입니다: PUBLISHED → DRAFT')
      }),
    })
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.click(screen.getByRole('button', { name: 'PUB0 단종' }))
    expect(screen.getByRole('status')).toHaveTextContent('허용되지 않은 상태 전이입니다')
  })
})

describe('일괄 선택 · 일괄 게시', () => {
  const bulkBar = () => screen.queryByRole('region', { name: '일괄 작업' })

  it('선택이 없어도 일괄 작업 바는 보이고, 일괄 액션은 비활성이다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    expect(bulkBar()).toBeInTheDocument()
    expect(bulkBar()).toHaveTextContent('0건 선택')
    expect(screen.getByRole('button', { name: '일괄 게시' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '일괄 단종' })).toBeDisabled()
  })

  it('행을 선택하면 선택 건수가 갱신되고 일괄 액션이 활성화된다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'PUB0 선택' }))
    expect(bulkBar()).toHaveTextContent('1건 선택')
    expect(screen.getByRole('button', { name: '일괄 게시' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '일괄 단종' })).toBeEnabled()
  })

  it('페이지 전체 선택 체크박스로 보이는 행을 모두 선택한다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '이 페이지 전체 선택' }))
    expect(bulkBar()).toHaveTextContent('15건 선택')
  })

  it('선택 해제하면 0건 선택으로 돌아가고 액션이 비활성화된다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '이 페이지 전체 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }))
    expect(bulkBar()).toHaveTextContent('0건 선택')
    expect(screen.getByRole('button', { name: '일괄 게시' })).toBeDisabled()
  })

  it('일괄 게시는 선택한 id만 setStatusMany로 넘긴다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'PUB0 선택' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'DRAFTX 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '일괄 게시' }))
    expect(admin.setStatusMany).toHaveBeenCalledWith([1, 100], 'PUBLISHED')
  })

  it('필터를 걸면 선택은 필터 결과 안에서만 유효하다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '이 페이지 전체 선택' })) // 15건
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'DRAFT' } })
    expect(bulkBar()).toHaveTextContent('1건 선택')
    fireEvent.click(screen.getByRole('button', { name: '일괄 게시' }))
    expect(admin.setStatusMany).toHaveBeenCalledWith([100], 'PUBLISHED')
  })

  it('적용/제외 건수를 토스트로 요약하고 사유 예시를 보여준다', () => {
    const admin = makeAdmin({
      setStatusMany: vi.fn(() => ({
        applied: 1,
        skipped: [{ id: 101, modelCode: 'ARCHX', reason: '마력(HP)이 없어 게시할 수 없습니다' }],
      })),
    })
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '이 페이지 전체 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '일괄 게시' }))
    const toast = screen.getByRole('status')
    expect(toast).toHaveTextContent('1건 적용')
    expect(toast).toHaveTextContent('1건 제외')
    expect(toast).toHaveTextContent('마력(HP)이 없어')
  })

  it('일괄 게시 후 선택이 초기화된다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'PUB0 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '일괄 게시' }))
    expect(bulkBar()).toHaveTextContent('0건 선택')
  })

  it('일괄 게시 연타에도 setStatusMany는 1회만 호출된다(더블클릭 방지)', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'PUB0 선택' }))
    const btn = screen.getByRole('button', { name: '일괄 게시' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(admin.setStatusMany).toHaveBeenCalledTimes(1)
  })

  it('시리즈 필터로 좁힌 뒤 전체 선택하면 그 시리즈만 게시 대상이 된다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.change(screen.getByRole('combobox', { name: '시리즈 필터' }), { target: { value: 'S_IN_4WAY' } })
    expect(bodyRows()).toHaveLength(1) // DRAFTX만 S_IN_4WAY
    fireEvent.click(screen.getByRole('checkbox', { name: '이 페이지 전체 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '일괄 게시' }))
    expect(admin.setStatusMany).toHaveBeenCalledWith([100], 'PUBLISHED')
  })
})

describe('등록/수정 폼 (더블클릭 방지 포함)', () => {
  it('등록 폼에서 저장하면 createProduct를 DRAFT 입력으로 호출한다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    openCreateForm()
    fill('모델명', 'RNW-NEW')
    fill('냉방 용량(W)', '4000')
    fill('난방 용량(W)', '4500')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(admin.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ seriesCode: 'S_IN_4WAY', modelCode: 'RNW-NEW', coolingW: 4000, heatingW: 4500 }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // 성공 시 닫힘
  })

  it('저장 버튼을 연타해도 createProduct는 1회만 호출된다(더블클릭 방지)', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    openCreateForm()
    fill('모델명', 'RNW-NEW')
    fill('냉방 용량(W)', '4000')
    const save = screen.getByRole('button', { name: '저장' })
    fireEvent.click(save)
    fireEvent.click(save)
    fireEvent.click(save)
    expect(admin.createProduct).toHaveBeenCalledTimes(1)
  })

  it('행 액션(재게시)도 연타 시 setStatus가 1회만 호출된다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'ARCHIVED' } })
    const republish = screen.getByRole('button', { name: 'ARCHX 재게시' })
    fireEvent.click(republish)
    fireEvent.click(republish)
    expect(admin.setStatus).toHaveBeenCalledTimes(1)
  })

  it('도메인 예외가 나면 폼을 닫지 않고 오류 메시지를 보여준다', () => {
    const admin = makeAdmin({
      createProduct: vi.fn(() => {
        throw new EquipmentDomainError('DUPLICATE_MODEL_CODE', '이미 등록된 모델명입니다: RNW-DUP')
      }),
    })
    render(<EquipmentAdminPage admin={admin} />)
    openCreateForm()
    fill('모델명', 'RNW-DUP')
    fill('냉방 용량(W)', '4000')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('alert')).toHaveTextContent('이미 등록된 모델명입니다')
    expect(screen.getByRole('dialog')).toBeInTheDocument() // 열린 채 유지
  })

  it('실패 후 입력을 고쳐 다시 저장하면 정상 호출된다(가드가 잠긴 채 남지 않는다)', async () => {
    const createProduct = vi.fn()
      .mockImplementationOnce(() => { throw new EquipmentDomainError('DUPLICATE_MODEL_CODE', '중복') })
      .mockImplementationOnce(() => 7)
    const admin = makeAdmin({ createProduct })
    render(<EquipmentAdminPage admin={admin} />)
    openCreateForm()
    fill('모델명', 'DUP')
    fill('냉방 용량(W)', '4000')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await act(async () => {}) // 가드 해제(마이크로태스크) — 실제 사용자의 재클릭도 다음 tick에 일어난다
    fill('모델명', 'OK')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(createProduct).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('실외기 시리즈를 고르면 마력·최대연결수 입력이 나타나고, 실내기에서는 숨는다', () => {
    render(<EquipmentAdminPage admin={makeAdmin()} />)
    openCreateForm()
    expect(screen.queryByLabelText('마력(HP)')).not.toBeInTheDocument() // 기본=실내기 시리즈
    fireEvent.change(screen.getByLabelText('시리즈'), { target: { value: 'S_OUT_HR' } })
    expect(screen.getByLabelText('마력(HP)')).toBeInTheDocument()
    expect(screen.getByLabelText('최대 연결 실내기 수')).toBeInTheDocument()
  })

  it('수정 폼은 기존 값으로 채워지고 updateProduct를 호출한다', () => {
    const admin = makeAdmin()
    render(<EquipmentAdminPage admin={admin} />)
    fireEvent.change(screen.getByRole('combobox', { name: '상태 필터' }), { target: { value: 'DRAFT' } })
    fireEvent.click(screen.getByRole('button', { name: 'DRAFTX 수정' }))
    expect(screen.getByLabelText('모델명')).toHaveValue('DRAFTX')
    fill('냉방 용량(W)', '21000')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(admin.updateProduct).toHaveBeenCalledWith(100, expect.objectContaining({ coolingW: 21000, modelCode: 'DRAFTX' }))
  })
})


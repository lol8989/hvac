/** @vitest-environment jsdom */
// 업로드 모달: 파일 선택 → 검증 요약 → 정상 행만 적재. 파서는 주입(parseFile)해 xlsx IO를 배제한다.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SpecSheetUploadModal from './SpecSheetUploadModal'
import type { SeriesOption } from '../../application/equipment/adminPorts'
import type { ParsedProduct } from '../../domain/equipment/SpecImport'
import type { ParsedSheet } from '../../infrastructure/equipment/spec/parseSpecSheet'

const SERIES: SeriesOption[] = [
  { code: 'S_OUT_HR', nameKo: 'Multi V Super 절환형', categoryCode: 'OUTDOOR', categoryName: '실외기', subcategoryName: '냉난방 절환형', energySource: 'EHP', isVrf: true },
  { code: 'S_IN_4WAY', nameKo: 'Multi V 실내기 4WAY', categoryCode: 'INDOOR', categoryName: '실내기', subcategoryName: '4WAY 카세트', energySource: 'EHP', isVrf: false },
]

const prod = (over: Partial<ParsedProduct> = {}): ParsedProduct => ({
  modelCode: 'RPUW281X9P', coolingW: 78400, heatingW: 88200, maxConnections: 45, specData: {}, ...over,
})

const xlsx = (name = 'spec.xlsx', size = 13819) => {
  const f = new File(['x'], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

const sheets = (products: ParsedProduct[]): ParsedSheet[] => [{ sheetName: 'Sheet', products, sets: [] }]

function setup(over: Partial<React.ComponentProps<typeof SpecSheetUploadModal>> = {}) {
  const onImport = vi.fn((_seriesCode: string, rows: readonly unknown[]) => rows.length)
  const onClose = vi.fn()
  render(
    <SpecSheetUploadModal
      series={SERIES}
      existingModelCodes={[]}
      onImport={onImport}
      onClose={onClose}
      parseFile={async () => sheets([prod()])}
      {...over}
    />,
  )
  return { onImport, onClose }
}

const selectFile = async (file = xlsx()) => {
  const input = screen.getByLabelText('스펙시트 파일')
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } })
  })
}

const uploadBtn = () => screen.getByRole('button', { name: /^업로드/ })

describe('SpecSheetUploadModal', () => {
  it('파일 선택 전에는 업로드 버튼이 비활성이다', () => {
    setup()
    expect(uploadBtn()).toBeDisabled()
  })

  it('파일을 고르면 파일명·크기·감지 모델 수와 검증 요약을 보여준다', async () => {
    setup()
    await selectFile()
    expect(screen.getByText('spec.xlsx')).toBeInTheDocument()
    expect(screen.getByText(/13\.5 KB · 1개 모델 감지됨/)).toBeInTheDocument()
    expect(screen.getByText('총 모델 수')).toBeInTheDocument()
    expect(uploadBtn()).toBeEnabled()
  })

  it('정상/오류/중복 건수를 집계한다', async () => {
    setup({
      existingModelCodes: ['RPUW301X9P'], // 중복 1건
      parseFile: async () =>
        sheets([
          prod(), // OK
          prod({ modelCode: 'RPUW301X9P' }), // DUPLICATE
          prod({ modelCode: 'UXB' }), // ERROR — HP 유도 불가
        ]),
    })
    await selectFile()
    // 각 타일은 <div><span>라벨</span><b>값</b></div>
    const tile = (label: string) => screen.getByText(label).closest('div')!
    expect(tile('총 모델 수')).toHaveTextContent('3')
    expect(tile('정상 (등록 대상)')).toHaveTextContent('1건')
    expect(tile('중복 (스킵)')).toHaveTextContent('1건')
    expect(tile('오류 (스킵)')).toHaveTextContent('1건')
    expect(uploadBtn()).toHaveTextContent('업로드 (1건)')
  })

  it('오류·중복 사유를 목록으로 알려준다', async () => {
    setup({ parseFile: async () => sheets([prod({ modelCode: 'UXB' })]) })
    await selectFile()
    expect(screen.getByText(/마력\(HP\)을 유도할 수 없습니다/)).toBeInTheDocument()
  })

  it('등록 가능한 모델이 0건이면 업로드를 막는다', async () => {
    setup({ parseFile: async () => sheets([prod({ modelCode: 'UXB' })]) })
    await selectFile()
    expect(screen.getByRole('alert')).toHaveTextContent('등록할 수 있는 모델이 없습니다')
    expect(uploadBtn()).toBeDisabled()
  })

  it('실내기 시리즈로 바꾸면 HP를 요구하지 않아 오류가 정상으로 뒤집힌다', async () => {
    setup({ parseFile: async () => sheets([prod({ modelCode: 'WF1A008L2T4', coolingW: 2400, heatingW: 4300 })]) })
    await selectFile()
    expect(uploadBtn()).toBeDisabled() // 실외기 기본 → HP 유도 불가로 ERROR

    fireEvent.change(screen.getByLabelText('시리즈'), { target: { value: 'S_IN_4WAY' } })
    expect(uploadBtn()).toHaveTextContent('업로드 (1건)')
  })

  it('업로드하면 선택한 시리즈와 분류 결과를 넘기고 모달을 닫는다', async () => {
    const { onImport, onClose } = setup()
    await selectFile()
    fireEvent.click(uploadBtn())
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0]).toBe('S_OUT_HR')
    expect(onImport.mock.calls[0][1]).toHaveLength(1)
    expect(onClose).toHaveBeenCalled()
  })

  it('업로드 버튼 연타에도 1회만 적재한다(더블클릭 방지)', async () => {
    const { onImport } = setup()
    await selectFile()
    const btn = uploadBtn()
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('xlsx가 아니면 거부한다', async () => {
    setup()
    await selectFile(xlsx('spec.csv'))
    expect(screen.getByRole('alert')).toHaveTextContent('xlsx 파일만')
    expect(uploadBtn()).toBeDisabled()
  })

  it('10MB를 넘으면 거부한다', async () => {
    setup()
    await selectFile(xlsx('big.xlsx', 11 * 1024 * 1024))
    expect(screen.getByRole('alert')).toHaveTextContent('최대 10MB')
  })

  it('모델을 못 찾으면 원본 여부를 안내한다', async () => {
    setup({ parseFile: async () => [] })
    await selectFile()
    expect(screen.getByRole('alert')).toHaveTextContent('모델을 찾지 못했습니다')
  })

  it('파싱이 실패하면 파일 손상을 안내한다', async () => {
    setup({ parseFile: async () => { throw new Error('zip corrupt') } })
    await selectFile()
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('읽지 못했습니다'))
  })

  it('선택한 파일을 지우면 처음 상태로 돌아간다', async () => {
    setup()
    await selectFile()
    fireEvent.click(screen.getByRole('button', { name: '선택한 파일 지우기' }))
    expect(screen.getByLabelText('스펙시트 파일')).toBeInTheDocument()
    expect(uploadBtn()).toBeDisabled()
  })
})

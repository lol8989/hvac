// LG 스펙시트(전치형) 행렬 → ParsedProduct[]. 순수 함수 — 파일 IO/xlsx 라이브러리 무지.
//
// 시트 레이아웃 (제품군마다 라벨은 달라도 골격은 같다):
//   [헤더]   A='항목'   B=∅      C='단위'|'모델명'   D~ = 모델명들
//   [범례]   A='대분류' B='소분류'                     (ODU에만 있음 — 건너뜀)
//   [데이터] A=대분류   B=소분류  C=단위              D~ = 모델별 값
// 병합 셀의 대분류는 읽기 단계에서 forward-fill 되어 들어온다.
//
// 값 '-' 또는 공란은 null(미상). 롱테일 스펙은 "대분류 > 소분류" 키로 전부 보존한다.

import type { ParsedProduct, SpecCell } from '../../../domain/equipment/SpecImport'

export type CellValue = string | number | boolean | Date | null
export type SheetRow = readonly CellValue[]

// read-excel-file v9가 반환하는 시트 래퍼.
export interface WrappedSheet {
  sheet: string
  data: SheetRow[]
}

export interface ParsedSheet {
  sheetName: string
  products: ParsedProduct[]
}

// 한 파일에 시트가 여러 개면(1Way/4Way 등) 전부 파싱하고, 모델이 없는 시트는 버린다.
export function toParsedSheets(sheets: readonly WrappedSheet[]): ParsedSheet[] {
  return sheets.map((s) => ({ sheetName: s.sheet, products: parseSpecRows(s.data) })).filter((s) => s.products.length > 0)
}

const MODEL_START_COL = 3 // D열
const LABEL1 = 0
const LABEL2 = 1
const UNIT = 2

const text = (v: CellValue): string => (v == null ? '' : String(v).trim())
const isBlank = (v: CellValue): boolean => text(v) === '' || text(v) === '-'

// 라벨 비교는 공백 제거 후 수행한다 ('항 목', '전 원', '최대 연결 가능 실내기수').
const squash = (s: string): string => s.replace(/\s+/g, '')

// 헤더 = 모델명이 2개 이상 있고 C열에 '단위'/'모델명' 류 라벨이 있는 첫 행.
// (GHP는 상단 공백행 + C열='모델명', Multi V는 첫 행 + C열='단위')
function findHeaderRow(rows: readonly SheetRow[]): number {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    const models = row.slice(MODEL_START_COL).filter((v) => !isBlank(v))
    if (models.length >= 1 && text(row[UNIT]) !== '' && text(row[LABEL1]) !== '') return r
  }
  return -1
}

// 범례행('대분류'|'소분류')과 완전 공백행은 데이터가 아니다.
function isSkippableRow(row: SheetRow): boolean {
  const l1 = squash(text(row[LABEL1]))
  if (l1 === '대분류') return true
  return row.every(isBlank)
}

// kW → W(정수). 저장 왕복 시 부동소수 오차를 남기지 않는다.
const kwToW = (kw: number): number => Math.round(kw * 1000)

// '78.40', 78.4, '67 400'(비단절 공백 천단위) → 숫자. 실패 시 null.
function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = text(v).replace(/[\s  ]/g, '')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// 능력 행 판별: '소비전력/효율/전류/연료/한랭지/저온'은 능력이 아니다(같은 kW 단위를 쓴다).
const CAPACITY_EXCLUDE = ['소비', '전력', '효율', '전류', '연료', '한랭', '저온']

function isCapacityRow(label: string, unit: string, keyword: '냉방' | '난방'): boolean {
  if (squash(unit).toLowerCase() !== 'kw') return false
  if (!squash(label).includes(keyword)) return false
  return !CAPACITY_EXCLUDE.some((bad) => squash(label).includes(bad))
}

// 최대 연결 실내기 수: '실내기'와 '연결'을 함께 담은 라벨 (ODU '연결가능 실내기 대수', GHP '최대 연결 가능 실내기수')
function isMaxConnRow(label: string): boolean {
  const s = squash(label)
  return s.includes('실내기') && s.includes('연결')
}

interface LabeledRow {
  label: string // "대분류 소분류" 결합(판별용)
  key: string // "대분류 > 소분류" (specData 키)
  unit: string | null
  values: readonly CellValue[]
}

function toLabeledRows(rows: readonly SheetRow[], headerRow: number): LabeledRow[] {
  const out: LabeledRow[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (isSkippableRow(row)) continue
    const l1 = text(row[LABEL1])
    const l2 = text(row[LABEL2])
    if (l1 === '' && l2 === '') continue
    const unit = text(row[UNIT])
    out.push({
      label: `${l1} ${l2}`,
      key: l2 === '' ? l1 : `${l1} > ${l2}`,
      unit: unit === '' || unit === '-' ? null : unit,
      values: row.slice(MODEL_START_COL),
    })
  }
  return out
}

// 같은 키가 여러 번 나오면(예: kW / kcal-h 쌍) 뒤 행이 앞을 덮어쓰지 않도록 단위를 붙여 구분한다.
function specKey(row: LabeledRow, used: Set<string>): string {
  const base = row.key
  if (!used.has(base)) return base
  const withUnit = row.unit ? `${base} (${row.unit})` : base
  let k = withUnit
  let n = 2
  while (used.has(k)) k = `${withUnit} #${n++}`
  return k
}

export function parseSpecRows(rows: readonly SheetRow[]): ParsedProduct[] {
  const headerRow = findHeaderRow(rows)
  if (headerRow < 0) return []

  const header = rows[headerRow]
  const models = header.slice(MODEL_START_COL).map(text)
  const labeled = toLabeledRows(rows, headerRow)

  // 능력·최대연결 행은 시트에서 '첫 번째로 매칭되는' 행을 정격으로 본다
  // (FCU처럼 능력조건 A/B가 나뉜 경우 A를 정격으로 채택).
  const coolRow = labeled.find((r) => isCapacityRow(r.label, r.unit ?? '', '냉방'))
  const heatRow = labeled.find((r) => isCapacityRow(r.label, r.unit ?? '', '난방'))
  const connRow = labeled.find((r) => isMaxConnRow(r.label))

  const products: ParsedProduct[] = []
  models.forEach((modelCode, i) => {
    if (modelCode === '' || modelCode === '-') return

    const specData: Record<string, SpecCell> = {}
    const used = new Set<string>()
    for (const row of labeled) {
      const raw = row.values[i]
      if (isBlank(raw)) continue
      const k = specKey(row, used)
      used.add(k)
      specData[k] = { value: text(raw), unit: row.unit }
    }

    const coolKw = coolRow ? toNumber(coolRow.values[i]) : null
    const heatKw = heatRow ? toNumber(heatRow.values[i]) : null
    const conn = connRow ? toNumber(connRow.values[i]) : null

    products.push({
      modelCode,
      coolingW: coolKw === null ? null : kwToW(coolKw),
      heatingW: heatKw === null ? null : kwToW(heatKw),
      maxConnections: conn === null || !Number.isInteger(conn) || conn < 1 ? null : conn,
      specData,
    })
  })
  return products
}

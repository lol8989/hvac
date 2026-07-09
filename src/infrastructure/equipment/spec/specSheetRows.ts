// LG 스펙시트(전치형) 행렬 → ParsedProduct[]. 순수 함수 — 파일 IO/xlsx 라이브러리 무지.
//
// 시트 골격은 같지만 제품군마다 열 위치·라벨이 다르다.
//   Multi V / GHP / FCU / SINGLE / ERV : A~B=라벨, C=단위, D~=모델
//   Chiller / CDU / AWHP(일체형)        : A~C=라벨, D=단위, E~=모델
// 그래서 열 위치는 고정하지 않고 '모델명처럼 생긴 셀'이 처음 나오는 열로 자동 탐지한다.
//   모델 시작 열 = 헤더 행에서 첫 모델 코드 열, 단위 열 = 그 왼쪽, 라벨 = 그 왼쪽 전부.
//
// 값 '-' 또는 공란은 null(미상). 롱테일 스펙은 라벨 경로를 키로 전부 보존한다.

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

const text = (v: CellValue): string => (v == null ? '' : String(v).trim())
const isBlank = (v: CellValue): boolean => text(v) === '' || text(v) === '-'

// 라벨 비교는 공백 제거 후 ('항 목', '전 원', '최대 연결 가능 실내기수').
const squash = (s: string): string => s.replace(/\s+/g, '')

// 모델 코드 판별. 세트 조합('TUW072PA2SR + TNW072PA2UR')은 첫 토큰으로 판정한다.
// 'UXB'(샤시명) · '단위' · '1 Unit' 같은 값은 걸러진다.
const MODEL_CODE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/
export function isModelCode(raw: string): boolean {
  const head = raw.split('+')[0].trim().toUpperCase()
  if (head.length < 6) return false
  if (!MODEL_CODE.test(head)) return false
  return (head.match(/\d/g) ?? []).length >= 2 // 숫자 2자리 이상 — 순수 알파벳 코드 배제
}

interface Layout {
  headerRow: number
  modelStartCol: number
  unitCol: number
}

// 헤더 = 앞쪽 행 중 모델 코드가 가장 많이 등장하는 행. 동수면 위쪽 행.
function detectLayout(rows: readonly SheetRow[], scanRows = 8): Layout | null {
  let best: Layout | null = null
  let bestCount = 0
  for (let r = 0; r < Math.min(rows.length, scanRows); r++) {
    const cols = rows[r].map((v, i) => (isModelCode(text(v)) ? i : -1)).filter((i) => i >= 0)
    if (cols.length > bestCount) {
      bestCount = cols.length
      best = { headerRow: r, modelStartCol: cols[0], unitCol: cols[0] - 1 }
    }
  }
  return best && best.unitCol >= 1 ? best : null
}

// kW → W(정수). 저장 왕복 시 부동소수 오차를 남기지 않는다.
const kwToW = (kw: number): number => Math.round(kw * 1000)

// 공백(비단절 공백 포함) 제거 후 숫자화. 실패는 null.
function parseNum(s: string): number | null {
  const t = s.replace(/[\s  ]/g, '')
  if (t === '' || t === '-') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// '78.40', 78.4, '67 400' → 숫자. 범위값('4.45~14.50')·실패는 null.
function toNumber(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = text(v)
  if (s.includes('~')) return null
  return parseNum(s)
}

// 능력 칸은 단일값이거나 '최소 ~ 정격 ~ 최대' 3연값이다(SINGLE 실외기).
// 2연값('4.45~14.50' = 최소~최대)은 정격이 아니므로 버린다.
function toRated(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = text(v)
  if (!s.includes('~')) return parseNum(s)
  const parts = s.split('~').map((p) => parseNum(p))
  return parts.length === 3 && parts[1] !== null ? parts[1] : null
}

// 능력 행의 단위: kW 또는 W만 능력으로 인정한다(kcal/h·RT는 환산 표기).
type CapacityUnit = 'kW' | 'W'
function capacityUnit(unit: string): CapacityUnit | null {
  const u = squash(unit).toLowerCase()
  if (u === 'kw') return 'kW'
  if (u === 'w') return 'W'
  return null
}

// 능력값 → W(정수)
function toCapacityW(v: CellValue, unit: CapacityUnit): number | null {
  const n = toRated(v)
  if (n === null) return null
  return unit === 'kW' ? kwToW(n) : Math.round(n)
}

// 같은 kW 단위를 쓰지만 '능력'이 아닌 행들.
const CAPACITY_EXCLUDE = ['소비', '전력', '효율', '전류', '연료', '한랭', '저온']
const COOL_WORDS = ['냉방', '냉각', '냉장', '냉동']
const HEAT_WORDS = ['난방']

const excluded = (label: string): boolean => CAPACITY_EXCLUDE.some((bad) => squash(label).includes(bad))

function matchesCapacity(label: string, unit: string, words: string[]): boolean {
  return capacityUnit(unit) !== null && words.some((w) => squash(label).includes(w)) && !excluded(label)
}

// 칠러('능력')·CDU('능력(정격)')처럼 냉방/냉각 단어 없이 '능력'만 쓰는 시트용 폴백.
function matchesGenericCapacity(label: string, unit: string): boolean {
  return capacityUnit(unit) !== null && squash(label).includes('능력') && !excluded(label)
}

// 최대 연결 실내기 수 (ODU '연결가능 실내기 대수', GHP '최대 연결 가능 실내기수')
function isMaxConnRow(label: string): boolean {
  const s = squash(label)
  return s.includes('실내기') && s.includes('연결')
}

interface LabeledRow {
  label: string // 라벨 열 전부를 이은 판별용 문자열
  key: string // "대분류 > 소분류" (specData 키)
  unit: string | null
  values: readonly CellValue[]
}

// 범례행('대분류'|'소분류')과 라벨이 전혀 없는 행은 데이터가 아니다.
//
// 라벨은 계층적으로 이어받는다: 상위 열에 값이 나오면 그 아래 열들은 초기화한다.
// 병합 셀이 채워져 오는 시트(Multi V)와 비어 오는 시트(GHP)를 같은 키 체계로 맞추기 위함이며,
// 초기화가 없으면 대분류가 바뀔 때 이전 소분류가 새 대분류로 새어 들어간다.
function toLabeledRows(rows: readonly SheetRow[], layout: Layout): LabeledRow[] {
  const out: LabeledRow[] = []
  const carried: string[] = new Array(layout.unitCol).fill('')

  for (let r = layout.headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < layout.unitCol; c++) {
      const v = text(row[c])
      if (v !== '' && v !== '-') {
        carried[c] = v
        for (let k = c + 1; k < layout.unitCol; k++) carried[k] = ''
      }
    }
    const labels = carried.filter((v) => v !== '')
    if (!labels.length) continue
    if (squash(labels[0]) === '대분류') continue

    const unit = text(row[layout.unitCol])
    out.push({
      label: labels.join(' '),
      key: labels.join(' > '),
      unit: unit === '' || unit === '-' ? null : unit,
      values: row.slice(layout.modelStartCol),
    })
  }
  return out
}

// 같은 키가 여러 번 나오면(예: kW / kcal-h 쌍) 뒤 행이 앞을 덮지 않도록 단위를 붙여 구분한다.
function specKey(row: LabeledRow, used: Set<string>): string {
  if (!used.has(row.key)) return row.key
  const withUnit = row.unit ? `${row.key} (${row.unit})` : row.key
  let k = withUnit
  let n = 2
  while (used.has(k)) k = `${withUnit} #${n++}`
  return k
}

// 능력 행은 시트에서 '처음 매칭되는' 행을 정격으로 본다(FCU 능력조건 A/B → A).
const findCapacityRow = (labeled: LabeledRow[], words: string[]): LabeledRow | undefined =>
  labeled.find((r) => matchesCapacity(r.label, r.unit ?? '', words))

export function parseSpecRows(rows: readonly SheetRow[]): ParsedProduct[] {
  const layout = detectLayout(rows)
  if (!layout) return []

  const models = rows[layout.headerRow].slice(layout.modelStartCol).map(text)
  const labeled = toLabeledRows(rows, layout)

  const coolRow = findCapacityRow(labeled, COOL_WORDS) ?? labeled.find((r) => matchesGenericCapacity(r.label, r.unit ?? ''))
  const heatRow = findCapacityRow(labeled, HEAT_WORDS)
  const connRow = labeled.find((r) => isMaxConnRow(r.label))

  const products: ParsedProduct[] = []
  models.forEach((modelCode, i) => {
    if (!isModelCode(modelCode)) return

    const specData: Record<string, SpecCell> = {}
    const used = new Set<string>()
    for (const row of labeled) {
      const raw = row.values[i]
      if (isBlank(raw)) continue
      const k = specKey(row, used)
      used.add(k)
      specData[k] = { value: text(raw), unit: row.unit }
    }

    const coolingW = coolRow ? toCapacityW(coolRow.values[i], capacityUnit(coolRow.unit ?? '')!) : null
    const heatingW = heatRow ? toCapacityW(heatRow.values[i], capacityUnit(heatRow.unit ?? '')!) : null
    const conn = connRow ? toNumber(connRow.values[i]) : null

    products.push({
      modelCode,
      coolingW,
      heatingW,
      maxConnections: conn === null || !Number.isInteger(conn) || conn < 1 ? null : conn,
      specData,
    })
  })
  return products
}

// 전치형 스펙시트 파서 — 합성 행렬(구조 규칙) + 실제 LG 시트 2종(회귀 고정).
// 픽스처: src/test/fixtures (03_참고자료/LG전자 스펙시트 모음 원본 복사)
import { describe, it, expect } from 'vitest'
import readXlsxFile from 'read-excel-file/node'
import { resolve } from 'node:path'
import { parseSpecRows, toParsedSheets, isModelCode, type SheetRow } from './specSheetRows'

const readFixture = async (name: string) =>
  (await readXlsxFile(resolve('src/test/fixtures', name))) as unknown as { sheet: string; data: SheetRow[] }[]

describe('parseSpecRows (구조 규칙)', () => {
  const rows: SheetRow[] = [
    ['항목', null, '단위', 'AAA011X', 'BBB021X'],
    ['대분류', '소분류', null, null, null], // 범례행 — 건너뛴다
    ['구분', '샤시명', '-', 'UXB', 'UXC'],
    ['냉방능력', '정격', 'kW', '78.40', 84],
    ['냉방능력', null, 'kcal/h', '67 400', '72 300'],
    ['난방능력', '정격', 'kW', '88.20', '94.50'],
    ['난방능력', '저온(-15℃)', 'kW', '64.00', '71.00'], // 능력 아님(저온) — 무시
    ['소비전력(냉방)', '정격', 'kW', '29.50', '28.90'], // 능력 아님(소비전력) — 무시
    ['연결가능 실내기 대수', '최대 (조건부)', 'Units', 45, 49],
  ]

  it('헤더 D열부터 모델을 읽는다', () => {
    expect(parseSpecRows(rows).map((p) => p.modelCode)).toEqual(['AAA011X', 'BBB021X'])
  })

  it('정격 냉·난방 능력을 kW→W로 변환한다', () => {
    const [a, b] = parseSpecRows(rows)
    expect(a).toMatchObject({ coolingW: 78400, heatingW: 88200 })
    expect(b).toMatchObject({ coolingW: 84000, heatingW: 94500 })
  })

  it('소비전력·저온 행은 능력으로 오인하지 않는다', () => {
    expect(parseSpecRows(rows)[0].coolingW).toBe(78400) // 29.50kW(소비전력) 아님
    expect(parseSpecRows(rows)[0].heatingW).toBe(88200) // 64.00kW(저온) 아님
  })

  it('최대 연결 실내기 수를 읽는다', () => {
    expect(parseSpecRows(rows).map((p) => p.maxConnections)).toEqual([45, 49])
  })

  it('롱테일 스펙을 "대분류 > 소분류" 키로 전부 보존한다(단위 포함)', () => {
    const [a] = parseSpecRows(rows)
    expect(a.specData['구분 > 샤시명']).toEqual({ value: 'UXB', unit: null }) // 단위 '-' → null
    expect(a.specData['냉방능력 > 정격']).toEqual({ value: '78.40', unit: 'kW' })
    expect(a.specData['냉방능력']).toEqual({ value: '67 400', unit: 'kcal/h' }) // 소분류 없는 행
    expect(a.specData['소비전력(냉방) > 정격']).toEqual({ value: '29.50', unit: 'kW' })
  })

  it("값이 '-'이거나 공란이면 스펙에 담지 않는다", () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['냉방능력', '정격', 'kW', '10.0'],
      ['효율', 'IEER', 'W/W', '-'],
      ['효율', 'COP', 'W/W', null],
    ])
    expect(a.specData['효율 > IEER']).toBeUndefined()
    expect(a.specData['효율 > COP']).toBeUndefined()
  })

  it('용량을 못 읽으면 null (오류 분류는 도메인이 담당)', () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['구분', '샤시명', '-', 'UXB'],
    ])
    expect(a).toMatchObject({ coolingW: null, heatingW: null, maxConnections: null })
  })

  it('빈 모델명 열은 제품으로 만들지 않는다', () => {
    const parsed = parseSpecRows([
      ['항목', null, '단위', 'AAA011X', '-', null],
      ['냉방능력', '정격', 'kW', '10.0', '11.0', '12.0'],
    ])
    expect(parsed).toHaveLength(1)
  })

  it('헤더가 없으면 빈 배열', () => {
    expect(parseSpecRows([[null, null, null]])).toEqual([])
  })

  it("단위가 W면 그대로, kW면 ×1000으로 환산한다", () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['냉방능력', '정격', 'W', '7 200'],
      ['난방능력', '정격', 'kW', '9.00'],
    ])
    expect(a).toMatchObject({ coolingW: 7200, heatingW: 9000 })
  })

  it("'최소 ~ 정격 ~ 최대' 3연값은 가운데(정격)를 취한다(SINGLE 실외기)", () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['냉방능력', '최소 ~ 정격 ~ 최대', 'W', '4 450 ~ 7 200 ~ 14 500'],
      ['난방능력', '최소 ~ 정격 ~ 최대', 'W', '6 000 ~ 9 000 ~ 14 000'],
    ])
    expect(a).toMatchObject({ coolingW: 7200, heatingW: 9000 })
  })

  it("'최소 ~ 최대' 2연값은 정격이 아니므로 버린다", () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['냉방능력', '최소 ~ 최대', 'kW', '4.45~14.50'],
    ])
    expect(a.coolingW).toBeNull()
  })

  it('kcal/h·RT 단위 행은 능력으로 쓰지 않는다', () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['냉방능력', '정격', 'kcal/h', '6 191'],
      ['법정냉동능력', null, 'RT', '9.35'],
    ])
    expect(a.coolingW).toBeNull()
  })
})

describe('실제 LG 스펙시트 (Multi V Super 5 고급형 ODU)', () => {
  it('4개 모델과 정격 능력·최대연결수를 읽는다', async () => {
    const [sheet] = toParsedSheets(await readFixture('mv_super5_odu.xlsx'))
    expect(sheet.products.map((p) => p.modelCode)).toEqual(['RPUW281X9P', 'RPUW301X9P', 'RPUW321X9P', 'RPUW34GX9P'])

    const first = sheet.products[0]
    expect(first).toMatchObject({ coolingW: 78400, heatingW: 88200, maxConnections: 45 })
  })

  it('일람표가 필요로 하는 롱테일 스펙(전원·배관경·전선·차단기·냉매)을 담는다', async () => {
    const [sheet] = toParsedSheets(await readFixture('mv_super5_odu.xlsx'))
    const s = sheet.products[0].specData
    expect(s['전원 > Case 1'].value).toBe('380, 3상(4선), 60')
    expect(s['냉매 연결 배관경 > 액관'].value).toBe('Φ19.05 (3/4)')
    expect(s['연결전선 > 전원선(H07RN-F, 접지포함)'].value).toBe('16.0 × 5C')
    expect(s['전기특성치 > 차단기(ELCB)']).toEqual({ value: '75', unit: 'A' })
    expect(s['냉매 > 종류'].value).toBe('R410A')
    expect(s['제품중량 > 본체중량']).toEqual({ value: '300', unit: 'kg' })
  })
})

describe('isModelCode (모델 코드 판별)', () => {
  it('모델 코드를 통과시킨다', () => {
    for (const m of ['RPUW281X9P', 'GP-W560C2S', 'WF1A008L2T4', 'ACAH020LET2', 'LSC-V1200C9', 'Z-E0100R2AR']) {
      expect(isModelCode(m)).toBe(true)
    }
  })

  it('세트 조합 모델명은 첫 토큰으로 판정한다', () => {
    expect(isModelCode('TUW072PA2SR + TNW072PA2UR')).toBe(true)
  })

  it('라벨·샤시명·단위는 거른다', () => {
    for (const s of ['UXB', '단위', '모델명', '1 Unit', '', '-', 'kW', '380, 3상(4선), 60']) {
      expect(isModelCode(s)).toBe(false)
    }
  })
})

describe('실제 LG 스펙시트 (Air-Cooled Scroll Chiller — 모델이 E열, 라벨이 A~C열)', () => {
  it('열 위치를 자동 탐지해 8개 모델을 읽는다', async () => {
    const sheets = toParsedSheets(await readFixture('chiller_air_cooled_co.xlsx'))
    const s440 = sheets.find((s) => s.sheetName === 'Spec.440V')!
    expect(s440.products.map((p) => p.modelCode)).toContain('ACAH020HET2')
    expect(s440.products).toHaveLength(8)
  })

  it("냉방/냉각 단어 없이 '능력'만 있어도 정격 능력을 뽑는다(냉방전용 → 난방 null)", async () => {
    const s440 = toParsedSheets(await readFixture('chiller_air_cooled_co.xlsx')).find((s) => s.sheetName === 'Spec.440V')!
    expect(s440.products[0]).toMatchObject({ modelCode: 'ACAH020HET2', coolingW: 65000, heatingW: null })
  })

  it('A~C열 라벨을 이어 스펙 키로 쓴다', async () => {
    const s440 = toParsedSheets(await readFixture('chiller_air_cooled_co.xlsx')).find((s) => s.sheetName === 'Spec.440V')!
    expect(s440.products[0].specData['소비 전력']).toMatchObject({ unit: 'kW' })
  })
})

describe('실제 LG 스펙시트 (SINGLE CST — 세트 조합 모델명)', () => {
  it("'실외기 + 실내기' 세트 모델명을 그대로 모델 코드로 읽는다", async () => {
    const odu = toParsedSheets(await readFixture('single_cst_set.xlsx')).find((s) => s.sheetName === 'ODU')!
    expect(odu.products[0].modelCode).toContain('TUW072PA2SR')
    expect(odu.products[0].modelCode).toContain('+')
    expect(odu.products[0].coolingW).toBe(7200)
  })

  it("범위값('4.45~14.50')은 정격으로 오인하지 않는다", async () => {
    const odu = toParsedSheets(await readFixture('single_cst_set.xlsx')).find((s) => s.sheetName === 'ODU')!
    expect(odu.products[0].coolingW).toBe(7200) // '최소 ~ 최대' 행이 아니라 '정격' 행
  })
})

describe('실제 LG 스펙시트 (주거용 ERV — 냉난방 용량이 없는 환기 장비)', () => {
  it('모델은 읽되 냉난방 용량은 null이다', async () => {
    const [sheet] = toParsedSheets(await readFixture('erv_residential.xlsx'))
    expect(sheet.products.length).toBeGreaterThan(0)
    const p = sheet.products.find((x) => x.modelCode.startsWith('Z-E'))!
    expect(p).toMatchObject({ coolingW: null, heatingW: null })
  })

  it('환기 고유 스펙(전원·샤시명)은 보존된다', async () => {
    const [sheet] = toParsedSheets(await readFixture('erv_residential.xlsx'))
    const p = sheet.products[0]
    expect(p.specData['전원 > Case 1'].value).toContain('220')
  })
})

describe('실제 LG 스펙시트 (GHP Super III ODU — 헤더 위치·라벨이 다름)', () => {
  it('상단 공백행을 건너뛰고 헤더를 찾아 6개 모델을 읽는다', async () => {
    const [sheet] = toParsedSheets(await readFixture('ghp_super3_odu.xlsx'))
    expect(sheet.products.map((p) => p.modelCode)).toEqual([
      'GPUW280C2S', 'GPUW300C2S', 'GPUW320C2S', 'GP-W560C2S', 'GP-W600C2S', 'GP-W640C2S',
    ])
  })

  it("'능력 > 냉방 (정격)' 형태의 라벨에서도 정격 능력을 뽑는다", async () => {
    const [sheet] = toParsedSheets(await readFixture('ghp_super3_odu.xlsx'))
    expect(sheet.products[0]).toMatchObject({ coolingW: 82000, heatingW: 90000, maxConnections: 53 })
    expect(sheet.products[3]).toMatchObject({ coolingW: 164000, heatingW: 180000 }) // GP-W560C2S (280×2)
  })

  it('병합 셀이 비어 와도 부모 라벨을 이어받는다 (난방 (정격) → 능력 > 난방 (정격))', async () => {
    const [sheet] = toParsedSheets(await readFixture('ghp_super3_odu.xlsx'))
    const s = sheet.products[0].specData
    expect(s['능력 > 냉방 (정격)']).toEqual({ value: '82', unit: 'kW' })
    expect(s['능력 > 난방 (정격)']).toEqual({ value: '90', unit: 'kW' })
    expect(s['난방 (정격)']).toBeUndefined() // 부모 없는 키가 생기면 안 된다
  })

  it('대분류가 바뀌면 이전 소분류가 새 대분류로 새지 않는다', () => {
    const [a] = parseSpecRows([
      ['항목', null, '단위', 'AAA011X'],
      ['냉방능력', '정격', 'kW', '10.0'],
      ['법정냉동능력', null, 'RT', '9.35'],
    ])
    expect(a.specData['법정냉동능력']).toEqual({ value: '9.35', unit: 'RT' })
    expect(a.specData['법정냉동능력 > 정격']).toBeUndefined()
  })

  it('연료 소비량은 능력으로 오인하지 않는다(GHP 고유 항목)', async () => {
    const [sheet] = toParsedSheets(await readFixture('ghp_super3_odu.xlsx'))
    expect(sheet.products[0].coolingW).not.toBe(53900) // 연료 소비량 냉방 53.9kW
    expect(sheet.products[0].specData['연료 소비량 > 냉방 (정격)'].value).toBe('53.9')
  })
})

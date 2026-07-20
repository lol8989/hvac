// 장비일람표 빌더 — 정본(장비일람표_이미지판독본.xlsx / GHP실외기 판독본) 컬럼 재현.
// 근거: doc/05_설계결정/일람표_컬럼_매핑표.md
import { describe, it, expect } from 'vitest'
import { buildScheduleSheets, INDOOR_COLUMNS, OUTDOOR_EHP_COLUMNS, OUTDOOR_GHP_COLUMNS } from './scheduleTable'
import type { ScheduleInput } from './scheduleTable'
import { IndoorModel } from '../../domain/generation/IndoorModel'
import type { SpecData } from '../../domain/equipment/SpecLookup'
import type { SpecCell } from '../../domain/equipment/SpecImport'

const cell = (value: string, unit: string | null = null): SpecCell => ({ value, unit })

const IDU = new IndoorModel({ model: 'RNW0201C2S', coolW: 2000, heatW: 2200, type: '1WAY 카세트', energySource: 'EHP' })

const IDU_SPEC: SpecData = {
  '전원 > Case 1': cell('220, 1상(2선), 60'),
  '소비전력(실내기) > 강/중/약': cell('11 / - / -', 'W'),
  '실내 송풍기 > 풍량((파워)/강/중/약)': cell('- / 7.6 / 7.1 / 6.2', 'm³/min'),
  '실내 팬모터 > 정격출력': cell('30', 'W'),
  '제품중량 > 본체중량': cell('11.7', 'kg'),
  '냉매 연결 배관경 > 액관': cell('Φ6.35 (1/4)'),
  '냉매 연결 배관경 > 가스관': cell('Φ12.7 (1/2)'),
  '드레인(드레인 펌프) > 외경 / 내경': cell('32 / 25', 'mm'),
  '제품치수 > 본체치수(W x H x D)': cell('860 x 132 x 450', 'mm'),
  '연결전선 > 통신선(VCTF-SB)': cell('0.75 ~ 1.5 × 2'),
  '연결전선 > 전원선(H07RN-F, 접지포함)': cell('2.5 × 3'),
  '전기특성치 > 차단기(ELCB)': cell('15', 'A'),
}

const ODU_EHP = { model: 'RPUW12BX9M', category: '냉난방 절환형', energySource: 'EHP' as const, capacityKw: 34.8, heatKw: 39.2, hp: 12 }
const ODU_GHP = { model: 'GPUW280C2S', category: 'GHP', energySource: 'GHP' as const, capacityKw: 82, heatKw: 90, hp: 28 }

const GHP_SPEC: SpecData = {
  '사용연료 > 가스종': cell('LNG 13A / LPG'),
  '압축기 > 형식': cell('Scroll x 2'),
  '배관경 > 냉매 액관': cell('19.05', 'ø,mm'),
  '냉각수펌프 > 소비전력': cell('0.165', 'kW'),
  '냉매 > 냉매명': cell('R410A'),
}

const input = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  indoorBom: [{ code: 'RNW0201C2S', model: 'RNW0201C2S', quantity: 3 }],
  outdoorBom: [{ hp: 12, model: 'RPUW12BX9M', quantity: 1 }],
  indoorModels: [IDU],
  outdoorSpecs: [ODU_EHP],
  specs: new Map([['RNW0201C2S', IDU_SPEC]]),
  ...over,
})

const sheetNames = (sheets: ReturnType<typeof buildScheduleSheets>) => sheets.map((s) => s.name)
const rowOf = (sheets: ReturnType<typeof buildScheduleSheets>, name: string) => sheets.find((s) => s.name === name)!.rows[0]
const colIndex = (cols: readonly string[], label: string) => cols.findIndex((c) => c === label)

describe('buildScheduleSheets — 시트 구성', () => {
  it('계열별로 시트를 나눈다 (정본이 GHP 전용 39컬럼이라 EHP와 컬럼 집합이 다르다)', () => {
    const sheets = buildScheduleSheets(input({ outdoorBom: [{ hp: 12, model: 'RPUW12BX9M', quantity: 1 }, { hp: 28, model: 'GPUW280C2S', quantity: 2 }], outdoorSpecs: [ODU_EHP, ODU_GHP], specs: new Map([['GPUW280C2S', GHP_SPEC]]) }))
    expect(sheetNames(sheets)).toEqual(['실내기', '실외기(EHP)', '실외기(GHP)'])
  })

  it('해당 계열의 실외기가 없으면 그 시트를 만들지 않는다', () => {
    expect(sheetNames(buildScheduleSheets(input()))).toEqual(['실내기', '실외기(EHP)'])
  })

  it('선정된 장비가 없으면 시트가 없다', () => {
    expect(buildScheduleSheets(input({ indoorBom: [], outdoorBom: [] }))).toEqual([])
  })
})

describe('buildScheduleSheets — 실내기 24컬럼', () => {
  it('정본 컬럼 순서를 따른다', () => {
    expect(INDOOR_COLUMNS).toHaveLength(24)
    expect(INDOOR_COLUMNS.slice(0, 7)).toEqual(['장비번호', '분류', '모델명', '수량(대)', '정격냉방능력(W)', '정격난방능력(W)', '전원(상,선식,V,Hz)'])
    expect(INDOOR_COLUMNS[19]).toBe('반입치수(mm) WxHxD')
  })

  it('hot 필드와 롱테일 스펙을 한 행에 채운다', () => {
    const r = rowOf(buildScheduleSheets(input()), '실내기')
    const at = (label: string) => r[colIndex(INDOOR_COLUMNS, label)]
    expect(at('장비번호')).toBe('RNW0201C2S')
    expect(at('분류')).toBe('1WAY 카세트')
    expect(at('모델명')).toBe('RNW0201C2S')
    expect(at('수량(대)')).toBe('3')
    expect(at('정격냉방능력(W)')).toBe('2000')
    expect(at('정격난방능력(W)')).toBe('2200')
  })

  // 일람표 소비전력 컬럼은 kW인데 실내기 원문은 W다(11W). 단위를 보지 않으면 11kW로 적힌다.
  it('소비전력은 단위를 보고 kW로 환산한다', () => {
    const r = rowOf(buildScheduleSheets(input()), '실내기')
    expect(r[colIndex(INDOOR_COLUMNS, '정격소비전력(kW) 냉방')]).toBe('0.011')
  })

  it('값 변환기를 거친다 (전원 재배열·숫자 추출·최댓값)', () => {
    const r = rowOf(buildScheduleSheets(input()), '실내기')
    const at = (label: string) => r[colIndex(INDOOR_COLUMNS, label)]
    expect(at('전원(상,선식,V,Hz)')).toBe('1, 2, 220, 60')
    expect(at('배관구경 액관(mm)')).toBe('6.35')
    expect(at('배관구경 가스관(mm)')).toBe('12.7')
    expect(at('배관구경 드레인(mm)')).toBe('32')
    expect(at('송풍기 풍량(CMM)')).toBe('7.6')
    expect(at('본체치수(mm) WxHxD')).toBe('860x132x450')
    expect(at('전원선(mm²) H07RN-F')).toBe('2.5x3C')
    expect(at('누전차단기 규격')).toBe('15A')
  })

  // 스펙시트에 없는 항목은 지어내지 않는다.
  it('스펙시트에 없는 컬럼은 대시로 남는다 (반입치수)', () => {
    const r = rowOf(buildScheduleSheets(input()), '실내기')
    expect(r[colIndex(INDOOR_COLUMNS, '반입치수(mm) WxHxD')]).toBe('-')
    expect(r[colIndex(INDOOR_COLUMNS, '누전차단기 수량')]).toBe('-')
  })

  it('스펙이 아예 없는 모델도 행은 나온다 (hot 필드만 채우고 나머지는 대시)', () => {
    const r = rowOf(buildScheduleSheets(input({ specs: new Map() })), '실내기')
    const at = (label: string) => r[colIndex(INDOOR_COLUMNS, label)]
    expect(at('모델명')).toBe('RNW0201C2S')
    expect(at('정격냉방능력(W)')).toBe('2000')
    expect(at('전원(상,선식,V,Hz)')).toBe('-')
    expect(at('제품중량(kg)')).toBe('-')
  })
})

describe('buildScheduleSheets — 실외기', () => {
  it('EHP 시트는 엔진·가스 컬럼을 갖지 않는다', () => {
    expect(OUTDOOR_EHP_COLUMNS).not.toContain('엔진소비열량 가스종류')
    expect(OUTDOOR_GHP_COLUMNS).toContain('엔진소비열량 가스종류')
  })

  it('실외기 행은 장비번호를 마력으로 쓴다 (0708 회의: 실외기 장비번호 = 마력)', () => {
    const sheets = buildScheduleSheets(input())
    const r = rowOf(sheets, '실외기(EHP)')
    const at = (label: string) => r[colIndex(OUTDOOR_EHP_COLUMNS, label)]
    expect(at('장비번호')).toBe('12HP')
    expect(at('분류')).toBe('냉난방 절환형')
    expect(at('모델명')).toBe('RPUW12BX9M')
    expect(at('수량(대)')).toBe('1')
    expect(at('냉방 정격(W)')).toBe('34800')
    expect(at('난방 정격(W)')).toBe('39200')
  })

  it('GHP 시트는 엔진·가스·냉매 컬럼을 채운다', () => {
    const sheets = buildScheduleSheets(input({ outdoorBom: [{ hp: 28, model: 'GPUW280C2S', quantity: 2 }], outdoorSpecs: [ODU_GHP], specs: new Map([['GPUW280C2S', GHP_SPEC]]) }))
    const r = rowOf(sheets, '실외기(GHP)')
    const at = (label: string) => r[colIndex(OUTDOOR_GHP_COLUMNS, label)]
    expect(at('수량(대)')).toBe('2')
    expect(at('엔진소비열량 가스종류')).toBe('LNG 13A / LPG')
    expect(at('압축기 형식')).toBe('Scroll x 2')
    expect(at('배관경 냉매 액관(mm)')).toBe('19.05')
    expect(at('냉매')).toBe('R410A')
  })

  it('냉방전용 실외기는 난방 셀이 대시다', () => {
    const co = { model: 'RPUQ141X9S', category: '냉방전용', energySource: 'EHP' as const, capacityKw: 39.2, heatKw: null, hp: 14 }
    const sheets = buildScheduleSheets(input({ outdoorBom: [{ hp: 14, model: 'RPUQ141X9S', quantity: 1 }], outdoorSpecs: [co], specs: new Map() }))
    const r = rowOf(sheets, '실외기(EHP)')
    expect(r[colIndex(OUTDOOR_EHP_COLUMNS, '난방 정격(W)')]).toBe('-')
  })

  it('카탈로그에 없는 모델은 throw 하지 않고 건너뛴다', () => {
    const sheets = buildScheduleSheets(input({ outdoorBom: [{ hp: 99, model: 'GHOST', quantity: 1 }] }))
    expect(sheetNames(sheets)).toEqual(['실내기'])
  })
})

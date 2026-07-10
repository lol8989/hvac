// 장비일람표 빌더 — 선정 결과(BOM) + 카탈로그 hot 필드 + 롱테일 스펙 → 계열별 시트.
//
// 정본: doc/03_데이터/장비일람표_이미지판독본.xlsx(실내기 24컬럼) +
//       장비일람표_GHP실외기_이미지판독본.xlsx(39컬럼).
// 정본 실외기가 GHP 전용이라 EHP에 없는 항목(엔진·가스종·오일량)이 섞여 있다
// → 제품군마다 컬럼 집합이 다르다. 계열별 시트로 나눈다(주인님 확정 2026-07-10).
//
// 스펙시트에 없는 항목은 지어내지 않고 '-'로 남긴다.
// 매핑 근거: doc/05_설계결정/일람표_컬럼_매핑표.md

import type { OutdoorModelSpec } from '../../application/generation/ports'
import type { IndoorModel } from '../../domain/generation/IndoorModel'
import type { SpecData } from '../../domain/equipment/SpecLookup'
import { specCell, specValue, SPEC_KEYS } from '../../domain/equipment/SpecLookup'
import { DASH, breaker, dimensions, firstNumber, firstOf, maxOf, powerSupply, toKw, wireSpec } from '../equipment/scheduleFormat'

export interface ScheduleInput {
  indoorBom: ReadonlyArray<{ code: string; model: string; quantity: number }>
  outdoorBom: ReadonlyArray<{ hp: number; model: string; quantity: number }>
  indoorModels: readonly IndoorModel[]
  outdoorSpecs: ReadonlyArray<Pick<OutdoorModelSpec, 'model' | 'category' | 'energySource' | 'capacityKw' | 'heatKw' | 'hp'>>
  specs: ReadonlyMap<string, SpecData>
}

export interface ScheduleSheet {
  name: string
  columns: readonly string[]
  rows: string[][]
}

// ── 컬럼 정의 (정본 순서) ──

export const INDOOR_COLUMNS = [
  '장비번호',
  '분류',
  '모델명',
  '수량(대)',
  '정격냉방능력(W)',
  '정격난방능력(W)',
  '전원(상,선식,V,Hz)',
  '정격소비전력(kW) 냉방',
  '정격소비전력(kW) 난방',
  '운전전류(A) 냉방',
  '운전전류(A) 난방',
  '송풍기 풍량(CMM)',
  '송풍기 기외정압(mmAq)',
  '송풍기 정격출력(W)',
  '제품중량(kg)',
  '배관구경 액관(mm)',
  '배관구경 가스관(mm)',
  '배관구경 드레인(mm)',
  '본체치수(mm) WxHxD',
  '반입치수(mm) WxHxD',
  '몸심선(mm²) VCTF-SB',
  '전원선(mm²) H07RN-F',
  '누전차단기 규격',
  '누전차단기 수량',
] as const

// 실외기 공통(EHP) — 정본 GHP 39컬럼에서 엔진·연료 계열 항목을 뺀 것.
export const OUTDOOR_EHP_COLUMNS = [
  '장비번호',
  '분류',
  '모델명',
  '수량(대)',
  '냉방 정격(W)',
  '난방 정격(W)',
  '전원(상,선식,V,Hz)',
  '소비전력(kW) 냉방',
  '소비전력(kW) 난방',
  '운전전류(A) 냉방',
  '운전전류(A) 난방',
  '송풍기 풍량(CMM)',
  '송풍기 정격출력(W)',
  '압축기 형식',
  '냉매',
  '제품중량(kg)',
  '배관경 냉매 액관(mm)',
  '배관경 냉매 가스관(mm)',
  '본체치수(mm) WxHxD',
  '전원선(mm²) H07RN-F',
  '통신선(mm²) VCTF-SB',
  '누전차단기 규격',
  '누전차단기 수량',
  '비고',
] as const

// GHP 전용 컬럼을 끼워 넣은 확장 집합.
export const OUTDOOR_GHP_COLUMNS = [
  '장비번호',
  '분류',
  '모델명',
  '수량(대)',
  '냉방 정격(W)',
  '난방 정격(W)',
  '전원(상,선식,V,Hz)',
  '소비전력(kW) 냉방',
  '소비전력(kW) 난방',
  '엔진소비열량 가스종류',
  '운전전류(A) 냉방',
  '운전전류(A) 난방',
  '송풍기 풍량(CMM)',
  '송풍기 정격출력(W)',
  '압축기 형식',
  '엔진 출력',
  '엔진 회전수(rpm)',
  '오일소모량',
  '오일량(ℓ)',
  '냉매',
  '제품중량(kg)',
  '배관경 냉매 액관(mm)',
  '배관경 냉매 가스관(mm)',
  '배관경 엔진가스배관',
  '배관경 배기/드레인(mm)',
  '본체치수(mm) WxHxD',
  '전원선(mm²) H07RN-F',
  '통신선(mm²) VCTF-SB',
  '누전차단기 규격',
  '누전차단기 수량',
  '비고',
] as const

// ── 셀 채우기 ──

const num = (v: number | null | undefined): string => (v == null ? DASH : String(v))
const kwToW = (kw: number | null): string => (kw == null ? DASH : String(Math.round(kw * 1000)))
const get = (spec: SpecData | undefined, keys: readonly string[]): string | null => (spec ? specValue(spec, keys) : null)
// 소비전력은 단위(W/kW)가 계열마다 다르다 → 셀째로 꺼내 환산한다.
const getKw = (spec: SpecData | undefined, keys: readonly string[]): string => toKw(spec ? specCell(spec, keys) : null)

function indoorRow(bom: { code: string; model: string; quantity: number }, m: IndoorModel, spec: SpecData | undefined): string[] {
  return [
    bom.code,
    m.type,
    m.model,
    String(bom.quantity),
    num(m.coolW),
    num(m.heatW),
    powerSupply(get(spec, SPEC_KEYS.전원)),
    getKw(spec, SPEC_KEYS.소비전력_냉방),
    getKw(spec, SPEC_KEYS.소비전력_난방),
    firstNumber(get(spec, SPEC_KEYS.운전전류_냉방)),
    firstNumber(get(spec, SPEC_KEYS.운전전류_난방)),
    maxOf(get(spec, SPEC_KEYS.풍량)),
    firstOf(get(spec, SPEC_KEYS.기외정압)),
    firstNumber(get(spec, SPEC_KEYS.팬정격출력)),
    firstNumber(get(spec, SPEC_KEYS.본체중량)),
    firstNumber(get(spec, SPEC_KEYS.액관)),
    firstNumber(get(spec, SPEC_KEYS.가스관)),
    firstOf(get(spec, SPEC_KEYS.드레인)),
    dimensions(get(spec, SPEC_KEYS.본체치수)),
    DASH, // 반입치수 — 스펙시트에 없다
    wireSpec(get(spec, SPEC_KEYS.통신선)),
    wireSpec(get(spec, SPEC_KEYS.전원선)),
    breaker(get(spec, SPEC_KEYS.차단기)),
    DASH, // 누전차단기 수량 — 판독본에서도 '-'
  ]
}

type OduSpec = ScheduleInput['outdoorSpecs'][number]

function outdoorRow(bom: { hp: number; model: string; quantity: number }, o: OduSpec, spec: SpecData | undefined, ghp: boolean): string[] {
  const head = [
    `${bom.hp}HP`, // 0708 회의: 실외기 장비번호는 마력
    o.category,
    o.model,
    String(bom.quantity),
    kwToW(o.capacityKw),
    kwToW(o.heatKw),
    powerSupply(get(spec, SPEC_KEYS.전원)),
    getKw(spec, SPEC_KEYS.소비전력_냉방),
    getKw(spec, SPEC_KEYS.소비전력_난방),
  ]
  const gas = ghp ? [get(spec, SPEC_KEYS.가스종) ?? DASH] : []
  const mid = [
    firstNumber(get(spec, SPEC_KEYS.운전전류_냉방)),
    firstNumber(get(spec, SPEC_KEYS.운전전류_난방)),
    maxOf(get(spec, SPEC_KEYS.풍량)),
    firstNumber(get(spec, SPEC_KEYS.팬정격출력)),
    get(spec, SPEC_KEYS.압축기형식) ?? DASH,
  ]
  const engine = ghp
    ? [
        get(spec, SPEC_KEYS.엔진출력) ?? DASH,
        get(spec, SPEC_KEYS.엔진회전수) ?? DASH,
        firstNumber(get(spec, SPEC_KEYS.오일소모량)),
        firstNumber(get(spec, SPEC_KEYS.오일량)),
      ]
    : []
  const tail = [
    get(spec, SPEC_KEYS.냉매명) ?? DASH,
    firstNumber(get(spec, SPEC_KEYS.본체중량)),
    firstNumber(get(spec, SPEC_KEYS.액관)),
    firstNumber(get(spec, SPEC_KEYS.가스관)),
  ]
  const ghpPipes = ghp ? [get(spec, SPEC_KEYS.엔진가스배관) ?? DASH, firstNumber(get(spec, SPEC_KEYS.배기드레인))] : []
  const rest = [
    dimensions(get(spec, SPEC_KEYS.본체치수)),
    wireSpec(get(spec, SPEC_KEYS.전원선)),
    wireSpec(get(spec, SPEC_KEYS.통신선)),
    breaker(get(spec, SPEC_KEYS.차단기)),
    DASH, // 누전차단기 수량
    DASH, // 비고
  ]
  return [...head, ...gas, ...mid, ...engine, ...tail, ...ghpPipes, ...rest]
}

// 카탈로그에 없는 모델은 조용히 건너뛴다 — 산출물 생성이 통째로 실패하는 것보다 낫다.
export function buildScheduleSheets(input: ScheduleInput): ScheduleSheet[] {
  const sheets: ScheduleSheet[] = []

  const indoorRows = input.indoorBom
    .map((b) => {
      const m = input.indoorModels.find((x) => x.model === b.model || x.code === b.code)
      return m ? indoorRow(b, m, input.specs.get(m.model)) : null
    })
    .filter((r): r is string[] => r !== null)
  if (indoorRows.length) sheets.push({ name: '실내기', columns: INDOOR_COLUMNS, rows: indoorRows })

  const byEnergy = new Map<'EHP' | 'GHP', string[][]>()
  for (const b of input.outdoorBom) {
    const o = input.outdoorSpecs.find((x) => x.model === b.model)
    if (!o) continue
    const ghp = o.energySource === 'GHP'
    const key = ghp ? 'GHP' : 'EHP'
    byEnergy.set(key, [...(byEnergy.get(key) ?? []), outdoorRow(b, o, input.specs.get(o.model), ghp)])
  }
  if (byEnergy.has('EHP')) sheets.push({ name: '실외기(EHP)', columns: OUTDOOR_EHP_COLUMNS, rows: byEnergy.get('EHP')! })
  if (byEnergy.has('GHP')) sheets.push({ name: '실외기(GHP)', columns: OUTDOOR_GHP_COLUMNS, rows: byEnergy.get('GHP')! })

  return sheets
}

// LG 스펙시트 50개 → 4단 분류(대분류/중분류/시리즈) 매핑.
// 주인님 확정(2026-07-09): 계열에 CDU·ERV 추가 / 실내기 중분류는 표준 유형으로 정규화.
// 이 파일이 분류의 단일 출처다 — 시드 생성기(buildSpecSeed.ts)가 그대로 사용한다.

export interface Taxon {
  categoryCode: string
  subcategoryCode: string
  subcategoryName: string
  energySource: string
  seriesCode: string
  seriesName: string
  isVrf: boolean // VRF 계열(실외기 1대 ↔ 실내기 N대). 모델명 HP 인코딩·maxConn 요건·조합 후보 노출을 함께 가른다
}

export const CATEGORIES = [
  { code: 'OUTDOOR', nameKo: '실외기', sortOrder: 10 },
  { code: 'INDOOR', nameKo: '실내기', sortOrder: 20 },
  { code: 'VENT', nameKo: '환기', sortOrder: 30 },
]

// ── 실내기 중분류 표준 유형 (시트명 표기 흔들림 흡수) ──
// 순서가 곧 우선순위다: '인공지능 3.0 듀얼베인 4Way'는 '4Way'보다 먼저 '듀얼베인'에 걸려야 한다.
const INDOOR_TYPES: ReadonlyArray<[RegExp, string, string]> = [
  [/듀얼베인/, 'IN_4WAY_DV', '4WAY 카세트(듀얼베인)'],
  [/1[\s-]*way/i, 'IN_1WAY', '1WAY 카세트'],
  [/2[\s-]*way/i, 'IN_2WAY', '2WAY 카세트'],
  [/4[\s-]*way/i, 'IN_4WAY', '4WAY 카세트'],
  [/원형.*노출/, 'IN_ROUND_EXP', '원형 카세트(노출)'],
  [/원형/, 'IN_ROUND_EMB', '원형 카세트(매립)'],
  [/대공간|공조기/, 'IN_DUCT_BIG', '덕트(대공간)'],
  [/고정압/, 'IN_DUCT_HIGH', '덕트(고정압)'],
  [/저정압/, 'IN_DUCT_LOW', '덕트(저정압)'],
  [/덕트/, 'IN_DUCT_HIGH', '덕트(고정압)'],
  [/벽걸이/, 'IN_WALL', '벽걸이형'],
  [/바닥\s*상치/, 'IN_FLOOR', '바닥상치형'],
  [/상업용\s*천장/, 'IN_CEIL_COMM', '상업용 천장형'],
  [/스탠드/, 'IN_STAND', '스탠드형'],
]

function indoorType(sheet: string): { code: string; name: string } {
  for (const [re, code, name] of INDOOR_TYPES) {
    if (re.test(sheet)) return { code, name }
  }
  return { code: 'IN_ETC', name: '기타 실내기' }
}

// 시리즈는 중분류 하나에 속한다(4단 트리). 같은 제품군 이름이 여러 유형에 걸치면
// (예: 'Multi V 실내기(민수전용)'가 1WAY·4WAY·덕트에 모두 등장) 중분류별로 시리즈를 분리한다.
const slug = (name: string): string =>
  name
    .replace(/[()]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9가-힣_]/g, '')
    .toUpperCase()

const seriesCode = (name: string, subcategoryCode: string): string => `S_${slug(name)}__${subcategoryCode}`

const outdoor = (subCode: string, subName: string, sys: string, series: string, isVrf = false): Taxon => ({
  categoryCode: 'OUTDOOR',
  subcategoryCode: subCode,
  subcategoryName: subName,
  energySource: sys,
  seriesCode: seriesCode(series, subCode),
  seriesName: series,
  isVrf,
})

const indoor = (sheet: string, sys: string, series: string): Taxon => {
  const t = indoorType(sheet)
  return {
    categoryCode: 'INDOOR',
    subcategoryCode: t.code,
    subcategoryName: t.name,
    energySource: sys,
    seriesCode: seriesCode(series, t.code),
    seriesName: series,
    isVrf: false,
  }
}

// 파일명 + 시트명 → 분류. 분류 불가면 null(시드에서 제외하고 로그로 남긴다).
export function classifySheet(fileName: string, sheetName: string): Taxon | null {
  const f = fileName
  const s = sheetName

  if (f.startsWith('GHP')) return outdoor('OUT_GHP', 'GHP', 'GHP', 'GHP Super III', true)

  if (f.includes('AWHP')) {
    const series = f.includes('싱글') ? 'AWHP 싱글 시스템보일러' : 'AWHP 일체형 시스템보일러'
    if (s.includes('실내기')) return indoor(s, 'AWHP', series)
    return outdoor('OUT_AWHP', 'AWHP', 'AWHP', series)
  }

  if (f.includes('Chiller')) {
    if (f.includes('WaterCoold')) return outdoor('OUT_CHILLER_W', '수냉식 스크롤 칠러', '수냉식', 'Water-Cooled Scroll Chiller')
    if (/Inve[rn]ter/i.test(f)) return outdoor('OUT_CHILLER_I', '인버터 스크롤 칠러', 'Chiller', 'Inverter Scroll Chiller')
    return outdoor('OUT_CHILLER_A', '공랭식 스크롤 칠러', 'Chiller', 'Air-Cooled Scroll Chiller')
  }

  if (f.includes('CDU')) {
    const series = f.includes('COLD_CHAIN') ? 'Cold Chain CDU' : 'CDU'
    return outdoor('OUT_CDU', '냉장·냉동 CDU', 'CDU', series)
  }

  if (f.includes('Ventilation')) {
    const series = f.includes('Commercial') ? '상업용 ERV' : '주거용 ERV'
    return {
      categoryCode: 'VENT',
      subcategoryCode: 'VENT_ERV',
      subcategoryName: '열회수형 환기(ERV)',
      energySource: 'ERV',
      seriesCode: seriesCode(series, 'VENT_ERV'),
      seriesName: series,
      isVrf: false,
    }
  }

  if (f.includes('DOAS')) {
    return {
      categoryCode: 'INDOOR',
      subcategoryCode: 'IN_DOAS',
      subcategoryName: 'DOAS(외기처리 공조기)',
      energySource: 'EHP',
      seriesCode: seriesCode('DOAS / Slim DOAS', 'IN_DOAS'),
      seriesName: 'DOAS / Slim DOAS',
      isVrf: false,
    }
  }
  if (f.includes('FCU')) {
    return {
      categoryCode: 'INDOOR',
      subcategoryCode: 'IN_FCU',
      subcategoryName: 'FCU(팬코일 유닛)',
      energySource: 'EHP',
      seriesCode: seriesCode('FCU', 'IN_FCU'),
      seriesName: 'FCU',
      isVrf: false,
    }
  }

  if (f.includes('MULTI_V_IDU') || f.includes('Multi V_IDU')) {
    // 시스템보일러·천장매립덕트는 별도 시트 파일이다(구형 .xls) — 민수/조달과 섞지 않는다.
    const variant = f.includes('시스템보일러')
      ? '시스템보일러'
      : f.includes('천장매립덕트')
        ? '천장매립덕트'
        : f.includes('조달')
          ? '조달전용'
          : f.includes('대공간')
            ? '대공간덕트'
            : '민수전용'
    return indoor(f.includes('대공간') ? '대공간' : s, 'EHP', `Multi V 실내기(${variant})`)
  }

  // 'MV Water'(공백) · 'MVW' · 'MV_Water'(TA_MV_Water_S) 모두 수냉식 VRF다.
  if (f.includes('MV Water') || f.includes('MV_Water') || f.includes('MVW')) {
    const series = f.includes('Water_S') ? 'Multi V Water S' : f.includes('Water IV') ? 'Multi V Water IV' : 'Multi V Water 5'
    return outdoor('OUT_WATER', '수냉식', '수냉식', series, true)
  }

  if (f.includes('MultiV_i')) {
    const m = /MultiV_i[(_]([^)_]+)/.exec(f)
    const variant = m ? m[1] : '기본'
    const sim = f.includes('동시형')
    return outdoor(
      sim ? 'OUT_SIM' : 'OUT_HR',
      sim ? '동시형' : '냉난방 절환형',
      'EHP',
      `Multi V i(${variant})`,
      true,
    )
  }

  if (f.includes('MV Super 5')) {
    const m = /MV Super 5\(([^)]+)\)/.exec(f)
    const variant = m ? m[1] : '기본'
    const co = f.includes('냉전')
    const sim = f.includes('동시형')
    const prefix = f.startsWith('TA_') ? 'TA ' : ''
    return outdoor(
      co ? 'OUT_CO' : sim ? 'OUT_SIM' : 'OUT_HR',
      co ? '냉방전용' : sim ? '동시형' : '냉난방 절환형',
      'EHP',
      `${prefix}Multi V Super 5(${variant})`,
      true,
    )
  }

  if (f.includes('Multi V S')) {
    const co = s.includes('냉방')
    const series = f.includes('R32') ? 'Multi V S(R32)' : 'Multi V S'
    return outdoor(co ? 'OUT_CO' : 'OUT_HR', co ? '냉방전용' : '냉난방 절환형', 'EHP', series, true)
  }

  // MVS = Multi V S(구형 .xls 표기). 실내기 시트와 실외기 시트가 한 파일에 섞여 있다.
  //   MVS_주거 / MVS_상업(냉난방동시절환겸용) / SMART_MVS_주거_냉방전용(zip)
  if (/(^|_)(SMART_)?MVS_/.test(f)) {
    const smart = f.includes('SMART_')
    const scope = f.includes('상업') ? '상업' : '주거'
    const co = f.includes('냉방전용')
    const series = `${smart ? 'Smart ' : ''}Multi V S(${scope}${co ? '_냉방전용' : ''})`
    if (/실내기|IDU/i.test(s) || /실내기/.test(f)) return indoor(s, 'EHP', series)
    return outdoor(co ? 'OUT_CO' : 'OUT_HR', co ? '냉방전용' : '냉난방 절환형', 'EHP', series, true)
  }

  // ALL in 1 = 가정용 멀티(실외기 1 ↔ 실내기 N). 모델명 숫자가 마력이 아니라 용량이므로 VRF 아님.
  if (f.includes('ALLin1')) {
    const series = 'MULTI (ALL in 1)'
    if (/실내기|IDU/i.test(f) || /실내기|Way/i.test(s)) return indoor(s, 'EHP', series)
    return outdoor('OUT_MULTI', '가정용 멀티(ALL in 1)', 'EHP', series)
  }

  if (/SINGLE|Single/.test(f)) {
    const isIndoor = /IDU|실내기|CST|PAC/i.test(s) && !/ODU|Outdoor|실외기/i.test(s)
    if (isIndoor) return indoor(s, 'EHP', 'SINGLE / Universal')
    return outdoor('OUT_SINGLE', '시스템 에어컨(단품)', 'EHP', 'SINGLE / Universal')
  }

  return null
}

// 장비마스터 시드(equipment-seed.json) → 실내기·실외기 조합 확인표(xlsx)
// 현업 회신용. 우리 시스템의 현재 가정을 셀에 채워 두고, 틀린 곳만 고쳐 달라고 요청한다.
import fs from 'fs'
import writeXlsxFile from 'write-excel-file/node'

const OUT = process.argv[2] ?? 'doc/실내기_실외기_조합_확인표.xlsx'
const s = JSON.parse(fs.readFileSync('public/equipment-seed.json', 'utf8'))

const subByCode = new Map(s.subcategories.map((x) => [x.code, x]))
const serByCode = new Map(s.series.map((x) => [x.code, x]))
const specOf = (p, key) => {
  for (const k of Object.keys(p.specData ?? {})) if (k.includes(key)) return String(p.specData[k].value).trim()
  return null
}

// ── 기타 실내기(IN_ETC) 세분류 (고객 확인표 표시용) ──
// 시드 taxonomy는 시트명 키워드로만 중분류를 가르는데, 아래 시리즈들은 시트명에 유형 키워드가
// 없어 '기타 실내기'로 뭉쳐 있었다(주인님 지시 2026-07-15: 한 유형으로 두지 말고 명기).
// SINGLE 단품은 한 시트에 유형이 섞여 있어 모델코드 앞글자로 가른다(T/P/V/B).
//   T=천장형 카세트, B=벽걸이 (통상) · P=스탠드/패키지, V=? 는 추정 → 라벨에 '확인요망' 표기 + [질문]6.
// 앱 매칭(계열+VRF)엔 영향 없음 — 이 표의 표시 목적에 한한다.
const SINGLE_PREFIX = {
  T: '천장형 카세트',
  P: '스탠드·패키지형(확인요망)',
  V: '기타(V계열·확인요망)',
  B: '벽걸이형',
}
function refineIndoor(ser, sub, modelCode) {
  if (sub.code !== 'IN_ETC') return { label: sub.nameKo, key: ser.code }
  const nm = ser.nameKo
  // AWHP 시스템보일러는 실외기·실내기가 1:1로 짝지어진 전용 세트(VRF 조합 아님) → 그렇게 명기.
  // Multi V 시스템보일러(하이드로 키트)는 VRF 실내기라 구분한다.
  if (nm.includes('AWHP') && nm.includes('시스템보일러')) return { label: '시스템보일러(AWHP 전용·1:1)', key: ser.code }
  if (nm.includes('시스템보일러')) return { label: '시스템보일러', key: ser.code }
  if (nm === 'Multi V S(주거)') return { label: '천장형', key: ser.code } // 시트 '실내기-천장형'
  if (nm.includes('Smart Multi V S')) return { label: '천장형(확인요망)', key: ser.code }
  if (nm === 'SINGLE / Universal') {
    const pre = modelCode[0]
    const label = SINGLE_PREFIX[pre] ?? '기타 실내기'
    return { label, key: `${ser.code}|${SINGLE_PREFIX[pre] ? pre : 'etc'}` }
  }
  return { label: sub.nameKo, key: ser.code }
}

// 시리즈 단위 집계 (기타 실내기는 위 규칙으로 세분화)
const agg = new Map()
for (const p of s.products) {
  const ser = serByCode.get(p.seriesCode)
  const sub = subByCode.get(ser.subcategoryCode)
  const g = sub.categoryCode === 'INDOOR' ? refineIndoor(ser, sub, p.modelCode) : { label: sub.nameKo, key: p.seriesCode }
  if (!agg.has(g.key)) {
    agg.set(g.key, {
      code: g.key, cat: sub.categoryCode, sub: g.label, es: ser.energySource,
      name: ser.nameKo, isVrf: !!ser.isVrf, mfl: ser.mflCode,
      n: 0, pub: 0, refr: new Set(), cool: [], hp: [], maxConn: [], models: [],
    })
  }
  const a = agg.get(g.key)
  a.n++
  if (p.status === 'PUBLISHED') a.pub++
  const r = specOf(p, '냉매 > 종류')
  if (r) a.refr.add(r)
  if (p.coolingW) a.cool.push(p.coolingW)
  if (p.horsepower) a.hp.push(p.horsepower)
  if (p.maxConnections) a.maxConn.push(p.maxConnections)
  if (a.models.length < 2) a.models.push(p.modelCode)
}
const all = [...agg.values()]
const rng = (arr, f = (v) => String(v)) =>
  !arr.length ? '' : Math.min(...arr) === Math.max(...arr) ? f(Math.min(...arr)) : `${f(Math.min(...arr))} ~ ${f(Math.max(...arr))}`
const kw = (arr) => rng(arr, (v) => (v / 1000).toFixed(1))
const sortKey = (a) => `${a.es}|${a.sub}|${a.name}`
const outdoor = all.filter((a) => a.cat === 'OUTDOOR').sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
const indoor = all.filter((a) => a.cat === 'INDOOR').sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
const vent = all.filter((a) => a.cat === 'VENT')

// ── 스타일
const BAND = '#F0F0F2', LINE = '#CCCCCC'
const ASK = '#FFF2CC' // 현업이 채울 칸(연결 가능으로 이해한 O)
const NO = '#EFEFEF' // 연결 불가/대상 아님
// 헤더는 배경 음영 없이 굵은 글씨 + 테두리로만 구분한다(주인님 지시: 어두운 음영 제거).
const h = (v, extra = {}) => ({ value: v, fontWeight: 'bold', align: 'center', alignVertical: 'center', wrap: true, borderColor: LINE, ...extra })
const c = (v, extra = {}) => ({ value: v == null || v === '' ? null : String(v), type: String, borderColor: LINE, alignVertical: 'center', ...extra })

// ── 시트 1: 조합표 (실외기 행 × 실내기 열) ──
// 안내 시트는 두지 않는다(주인님 지시). 판정 기준·범례는 표 상단 배너 2줄로 접어 넣는다.
const colLabel = (a) => `${a.sub}\n${a.name}`
const totalCols = 4 + indoor.length + 1
// 시트 상단 설명 배너 — 전 컬럼을 span으로 병합한 1행. cols는 그 시트의 컬럼 수.
const banner = (text, cols, extra = {}) => [
  { value: text, span: cols, type: String, wrap: true, alignVertical: 'center', borderColor: LINE, ...extra },
  ...Array(cols - 1).fill(null),
]
const bannerRows = [
  banner('실내기–실외기 조합 가능 여부 확인표  ·  행 = 실외기 / 열 = 실내기', totalCols, { fontWeight: 'bold', fontSize: 13, backgroundColor: BAND }),
  banner(
    'O = 연결 가능한 것으로 이해한 조합입니다. 실제로는 불가하면 X로 고쳐 주세요.  ·  ' +
      'X = 계열이 달라 연결 불가로 본 조합.  ·  － = 멀티(실외기 1대 ↔ 실내기 여러 대) 조합 대상이 아닌 실외기(단품·칠러 등).  ' +
      '노란 O 칸만 확인해 주시고, 불가한 조합의 사유는 맨 오른쪽 [비고] 열에 적어 주세요.',
    totalCols,
    { backgroundColor: ASK },
  ),
]
const matrixHead = [
  h('실외기 \\ 실내기', { span: 4 }), null, null, null,
  ...indoor.map((i) => h(colLabel(i))),
  h('비고 (X 사유)'),
]
const matrixSub = [
  h('계열'), h('중분류'), h('시리즈'), h('모델수'),
  ...indoor.map((i) => h(`${i.es}\n${i.n}개`, { fontWeight: 'normal' })),
  h(''),
]
const matrixRows = outdoor.map((o) => [
  c(o.es, { backgroundColor: BAND }),
  c(o.sub, { backgroundColor: BAND }),
  c(o.name, { backgroundColor: BAND, fontWeight: 'bold' }),
  { value: o.n, type: Number, borderColor: LINE, align: 'center', backgroundColor: BAND },
  ...indoor.map((i) => {
    if (o.es !== i.es) return c('X', { backgroundColor: NO, align: 'center', color: '#999999' })
    if (!o.isVrf) return c('－', { backgroundColor: NO, align: 'center', color: '#999999' })
    return c('O', { backgroundColor: ASK, align: 'center', fontWeight: 'bold' })
  }),
  c(''),
])
const matrix = [...bannerRows, matrixHead, matrixSub, ...matrixRows]

// ── 시트 2: 실외기 시리즈 (근거자료 — 조합표 각 행의 정체) ──
const odHead = ['계열', '중분류', '시리즈', 'VRF', '모델수', '냉매', '냉방용량(kW)', '마력(HP)', '최대연결(대)', '대표모델', 'MFL']
const odRows = outdoor.map((o) => [
  c(o.es), c(o.sub), c(o.name, { fontWeight: 'bold' }), c(o.isVrf ? 'Y' : '', { align: 'center' }),
  { value: o.n, type: Number, borderColor: LINE, align: 'center' },
  c([...o.refr].join(' / ')), c(kw(o.cool)), c(rng(o.hp)), c(rng(o.maxConn)), c(o.models.join(', ')), c(o.mfl),
])

// ── 시트 3: 실내기 시리즈 (근거자료 — 조합표 각 열의 정체) ──
const idHead = ['계열', '중분류', '시리즈', '모델수', '냉매', '냉방용량(kW)', '대표모델', 'MFL']
const idRows = [...indoor, ...vent].map((i) => [
  c(i.es), c(i.sub), c(i.name, { fontWeight: 'bold' }),
  { value: i.n, type: Number, borderColor: LINE, align: 'center' },
  c([...i.refr].join(' / ')), c(kw(i.cool)), c(i.models.join(', ')), c(i.mfl),
])

// ── 시트 4: 질문 (표로 안 풀리는 것들)
const QS = [
  ['1', '냉매가 다르면 실내기–실외기를 연결할 수 없습니까?',
   `Multi V 라인업에 R32 기종(예: Multi V S R32)과 R410A 기종이 함께 있습니다. 냉매가 다른 실내기와 실외기는 서로 연결할 수 없는 것으로 이해하면 맞습니까? 또, 4WAY 카세트 일부 실내기는 카탈로그에 냉매가 'R410A / R32'로 병기돼 있는데, 이는 두 냉매 모두 호환된다는 의미입니까?`],
  ['2', 'FCU(팬코일 유닛)는 실외기에 직접 연결됩니까?',
   `FCU는 냉·온수 코일 방식이라 Multi V 같은 냉매식 실외기에 직접 연결되지 않는 것으로 이해하고 있습니다. 맞습니까? 그렇다면 실외기와의 조합 대상에서는 제외하는 것이 맞습니까?`],
  ['3', '시스템에어컨 단품(SINGLE)은 1:1 구성입니까?',
   `시스템에어컨 단품(SINGLE 계열)은 실외기 1대에 실내기 1대를 연결하는 1:1 구성으로 이해하고 있습니다. 맞습니까? 실외기 1대에 실내기 여러 대를 붙이는 멀티(Multi V) 방식과 한 현장에서 함께 쓰이는 경우가 있습니까?`],
  ['4', "'민수전용'과 '조달전용' 실내기는 무엇이 다릅니까?",
   `실내기 라인업이 '민수전용'과 '조달전용'으로 나뉘는데, 이는 성능·구조 등 사양의 차이입니까, 아니면 판매 채널만 다른 구분입니까? 한 현장에서 두 라인을 섞어서 설치해도 됩니까?`],
  ['5', '냉난방 동시형 실외기는 별도 부품이 필요합니까?',
   `냉난방 동시형(동시형) 실외기는 냉방·난방을 동시에 하기 위해 분배기(HR 유닛) 같은 별도 장치가 필요한 것으로 이해하고 있습니다. 맞습니까? 필요하다면 어떤 부품이 어떤 기준(대수·용량 등)으로 들어가는지 알려 주시면 장비 명세에 반영하겠습니다.`],
  ['6', '실내기 모델코드 앞글자(T/P/V/B)가 유형을 뜻합니까?',
   `시스템에어컨 단품(SINGLE) 실내기의 모델코드가 앞글자로 T·P·V·B로 나뉩니다(예: T=TNQ0232U2S, P=PNQ0830R2SF, V=VNW0720M2S, B=BNW1100M9SR). 저희는 T=천장형 카세트, B=벽걸이형으로 이해했는데, P와 V는 각각 어떤 유형입니까? 실내기 유형을 모델코드 앞글자로 판별하는 규칙이 맞는지 확인 부탁드립니다.`],
]
const qHead = ['No.', '질문', '우리가 이해하고 있는 내용 · 확인하고 싶은 점', '회신']
const qRows = QS.map(([n, q, b]) => [
  c(n, { align: 'center' }), c(q, { fontWeight: 'bold', wrap: true }), c(b, { wrap: true }), c('', { backgroundColor: ASK }),
])

const sheets = [
  {
    sheet: '조합표',
    data: matrix,
    columns: [{ width: 10 }, { width: 20 }, { width: 26 }, { width: 8 }, ...indoor.map(() => ({ width: 13 })), { width: 30 }],
    stickyRowsCount: 3, // 배너 2줄 + 헤더 1줄(span). 실제 컬럼 헤더는 그 아래 matrixSub.
    stickyColumnsCount: 3,
  },
  {
    sheet: '실외기 시리즈',
    data: [
      banner(
        '실외기 시리즈 근거자료 — [조합표]의 실외기(행)에 나온 각 시리즈가 실제로 무엇인지 보여줍니다. 조합 가능 여부를 확인하실 근거 스펙입니다.  (MFL = 공유해 주신 스펙시트 번호)',
        odHead.length,
        { backgroundColor: BAND, fontWeight: 'bold' },
      ),
      odHead.map((v) => h(v)),
      ...odRows,
    ],
    columns: [{ width: 10 }, { width: 20 }, { width: 28 }, { width: 6 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 26 }, { width: 14 }],
    stickyRowsCount: 2, // 설명 배너 + 헤더
  },
  {
    sheet: '실내기 시리즈',
    data: [
      banner(
        '실내기 시리즈 근거자료 — [조합표]의 실내기(열)에 나온 각 시리즈가 실제로 무엇인지 보여줍니다.  (MFL = 공유해 주신 스펙시트 번호)',
        idHead.length,
        { backgroundColor: BAND, fontWeight: 'bold' },
      ),
      idHead.map((v) => h(v)),
      ...idRows,
    ],
    columns: [{ width: 10 }, { width: 22 }, { width: 28 }, { width: 8 }, { width: 14 }, { width: 16 }, { width: 26 }, { width: 14 }],
    stickyRowsCount: 2, // 설명 배너 + 헤더
  },
  { sheet: '질문', data: [qHead.map((v) => h(v)), ...qRows], columns: [{ width: 5 }, { width: 40 }, { width: 90 }, { width: 30 }] },
]

await writeXlsxFile(sheets).toFile(OUT)
console.log(`생성: ${OUT}`)
console.log(`  실외기 시리즈 ${outdoor.length} × 실내기 시리즈 ${indoor.length}`)
const askCells = outdoor.reduce((n, o) => n + (o.isVrf ? indoor.filter((i) => i.es === o.es).length : 0), 0)
console.log(`  현업 확인 필요(노란 칸): ${askCells}칸 / 전체 ${outdoor.length * indoor.length}칸`)

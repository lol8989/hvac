// 전수 대조: 원본 스펙시트 폴더 vs 적재된 시드(equipment-seed.json)
// "검증 없이 마이그레이션했는가"를 확인한다. 누락 파일·빈 값·의심 값을 모두 센다.
import fs from 'fs'
import path from 'path'

const SRC = process.argv[2] ?? 'C:/Users/lolfr/Desktop/도면검도시스템/03_참고자료/LG전자 스펙시트 모음'
const seed = JSON.parse(fs.readFileSync('public/equipment-seed.json', 'utf8'))

// ── 1. 원본 파일 목록
// .xls는 xls_converted/, .zip은 zip_extracted/에 변환본이 있다(read-excel-file이 .xls를 못 읽는다).
// 시드는 변환본 파일명을 인용하므로, 커버리지는 '확장자를 뗀 이름'으로 대조한다.
const files = fs.readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)
const byExt = {}
for (const f of files) (byExt[path.extname(f).toLowerCase()] ??= []).push(f)
const stem = (f) => f.replace(/\.(xlsx|xls|zip)$/i, '')

// zip은 내부 파일명이 달라 zip 이름으로 대조할 수 없다 → 추출 폴더의 파일명으로 대신 본다.
const extracted = (() => {
  try {
    return fs.readdirSync(path.join(SRC, 'zip_extracted')).filter((f) => f.endsWith('.xlsx'))
  } catch {
    return []
  }
})()

// ── 2. 시드가 인용하는 원본 파일 (product.source = "파일명 | 시트명")
const sourced = new Map() // 파일명 → 제품수
for (const p of seed.products) {
  const file = String(p.source ?? '').split('|')[0].trim()
  sourced.set(file, (sourced.get(file) ?? 0) + 1)
}

console.log('════ 1. 파일 커버리지 ════')
console.log(`원본 폴더:  ${files.length}개 (${Object.entries(byExt).map(([e, a]) => `${e} ${a.length}`).join(' / ')})`)
console.log(`  + zip 추출본 ${extracted.length}개`)
console.log(`시드가 인용: ${[...sourced.keys()].filter(Boolean).length}개 파일 → 제품 ${seed.products.length}개`)
console.log(`  단품 세트(제품 아닌 조합): ${(seed.combinations ?? []).length}건\n`)

const usedStems = new Set([...sourced.keys()].map(stem))
const zipCovered = extracted.some((f) => usedStems.has(stem(f)))
const missing = files.filter((f) => (/\.zip$/i.test(f) ? !zipCovered : !usedStems.has(stem(f))))
const knownStems = new Set([...files, ...extracted].map(stem))
const ghost = [...sourced.keys()].filter((f) => f && !knownStems.has(stem(f)))

console.log(`── 적재 안 된 원본 파일: ${missing.length}개 ──`)
for (const f of missing) console.log(`   [${path.extname(f)}] ${f}`)
if (ghost.length) {
  console.log(`\n── 시드에는 있는데 폴더에 없는 파일(유령): ${ghost.length}개 ──`)
  for (const f of ghost) console.log(`   ${f} (제품 ${sourced.get(f)}개)`)
}

console.log('\n════ 2. 적재된 파일별 제품 수 ════')
for (const [f, n] of [...sourced.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(4)}개  ${f || '(source 없음)'}`)
}

// ── 3. 필드 결측 — 검증 없이 넣었다면 핵심 필드가 비어 있을 것이다
console.log('\n════ 3. 핵심 필드 결측 (제품 1206개 기준) ════')
const subByCode = new Map(seed.subcategories.map((x) => [x.code, x]))
const serByCode = new Map(seed.series.map((x) => [x.code, x]))
const meta = (p) => {
  const s = serByCode.get(p.seriesCode)
  const sub = subByCode.get(s.subcategoryCode)
  return { cat: sub.categoryCode, es: s.energySource, isVrf: !!s.isVrf, series: s.nameKo, sub: sub.nameKo }
}
const counts = {}
const bump = (k) => (counts[k] = (counts[k] ?? 0) + 1)
const violations = []
for (const p of seed.products) {
  const m = meta(p)
  if (!p.coolingW) bump('냉방능력 없음')
  if (!p.heatingW) bump('난방능력 없음(냉방전용 포함)')
  if (m.cat === 'OUTDOOR' && !p.horsepower) bump('실외기인데 마력 없음')
  if (m.isVrf && !p.maxConnections) { bump('VRF인데 최대연결 없음'); violations.push({ why: 'VRF·maxConn 없음', model: p.modelCode, series: m.series }) }
  if (!p.specData || Object.keys(p.specData).length === 0) bump('스펙 JSON 비어 있음')
  if (p.coolingW && p.coolingW < 0) bump('냉방능력 음수')
  if (m.cat === 'OUTDOOR' && p.horsepower && p.horsepower > 40) bump('실외기 40HP 초과(단일 상한 초과)')
}
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`   ${String(v).padStart(5)}  ${k}`)

// ── 4. 게시 상태
console.log('\n════ 4. 게시 상태 ════')
const byStatus = {}
for (const p of seed.products) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
console.log('  ', JSON.stringify(byStatus))

// ── 5. 모델 코드 중복/이상
console.log('\n════ 5. 모델코드 위생 ════')
const seen = new Map()
for (const p of seed.products) seen.set(p.modelCode, (seen.get(p.modelCode) ?? 0) + 1)
const dup = [...seen.entries()].filter(([, n]) => n > 1)
console.log(`   중복 모델코드: ${dup.length}건`, dup.slice(0, 5).map(([m, n]) => `${m}×${n}`).join(', '))
const weird = seed.products.filter((p) => !/^[A-Z0-9\-_.()/]+$/i.test(p.modelCode))
console.log(`   비정상 모델코드: ${weird.length}건`, weird.slice(0, 5).map((p) => JSON.stringify(p.modelCode)).join(', '))

// ── 6. 마력 출처 (환산 추정 = 검증 안 된 값)
console.log('\n════ 6. 마력(HP) 출처 ════')
const bySrc = {}
for (const p of seed.products) if (meta(p).cat === 'OUTDOOR') bySrc[p.hpSource ?? '(없음)'] = (bySrc[p.hpSource ?? '(없음)'] ?? 0) + 1
console.log('  ', JSON.stringify(bySrc))

// ── 7. 단가
console.log('\n════ 7. 단가 ════')
console.log(`   단가 있는 모델: ${seed.prices.length} / ${seed.products.length}`)

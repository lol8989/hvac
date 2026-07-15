import fs from 'fs'
const seed = JSON.parse(fs.readFileSync('public/equipment-seed.json', 'utf8'))
const subByCode = new Map(seed.subcategories.map((x) => [x.code, x]))
const serByCode = new Map(seed.series.map((x) => [x.code, x]))
const meta = (p) => {
  const s = serByCode.get(p.seriesCode)
  const sub = subByCode.get(s.subcategoryCode)
  return { cat: sub.categoryCode, es: s.energySource, isVrf: !!s.isVrf, series: s.nameKo, sub: sub.nameKo }
}
const src = (p) => String(p.source ?? '').split('|')[0].trim()

console.log('════ A. 모델코드에 "+"가 든 제품 (실외기+실내기 세트 표기?) ════')
const plus = seed.products.filter((p) => /[+]/.test(p.modelCode))
console.log(`총 ${plus.length}건`)
const byS = {}
for (const p of plus) { const k = `${meta(p).series} ← ${src(p)}`; (byS[k] ??= []).push(p.modelCode) }
for (const [k, v] of Object.entries(byS)) console.log(`  [${v.length}건] ${k}\n      예: ${v.slice(0, 3).join(' / ')}`)

console.log('\n════ B. 냉방능력 없는 제품 67건 — 어디서 왔나 ════')
const noCool = seed.products.filter((p) => !p.coolingW)
const byS2 = {}
for (const p of noCool) { const k = `${meta(p).cat} · ${meta(p).series}`; byS2[k] = (byS2[k] ?? 0) + 1 }
for (const [k, v] of Object.entries(byS2).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}건  ${k}`)

console.log('\n════ C. 실외기인데 마력 없는 16건 ════')
for (const p of seed.products.filter((p) => meta(p).cat === 'OUTDOOR' && !p.horsepower))
  console.log(`  ${p.modelCode.padEnd(28)} ${meta(p).series}  (냉방 ${p.coolingW ?? '-'}W)`)

console.log('\n════ D. 40HP 초과 실외기 — 상한(MAX_OUTDOOR_HP=40)에 걸려 선정에서 배제되는 물량 ════')
const over = seed.products.filter((p) => meta(p).cat === 'OUTDOOR' && p.horsepower > 40)
const vrfOver = over.filter((p) => meta(p).isVrf)
console.log(`  40HP 초과 실외기: ${over.length}건 (그중 VRF ${vrfOver.length}건 — 조합 후보였다가 배제됨)`)
const hpMax = Math.max(...seed.products.filter((p) => p.horsepower).map((p) => p.horsepower))
console.log(`  최대 마력: ${hpMax}HP`)
const byS3 = {}
for (const p of vrfOver) { const k = meta(p).series; byS3[k] = (byS3[k] ?? 0) + 1 }
for (const [k, v] of Object.entries(byS3).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${String(v).padStart(3)}건  ${k}`)

console.log('\n════ E. hpSource=DERIVED (모델명이 아니라 용량 환산으로 추정한 마력) ════')
const der = seed.products.filter((p) => p.hpSource === 'DERIVED')
const byS4 = {}
for (const p of der) { const k = `${meta(p).cat} · ${meta(p).series}`; byS4[k] = (byS4[k] ?? 0) + 1 }
console.log(`  총 ${der.length}건`)
for (const [k, v] of Object.entries(byS4).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`    ${String(v).padStart(3)}건  ${k}`)

console.log('\n════ F. VRF 실외기인데 최대연결 대수 없음 ════')
const vrfNoConn = seed.products.filter((p) => meta(p).isVrf && meta(p).cat === 'OUTDOOR' && !p.maxConnections)
console.log(`  ${vrfNoConn.length}건`)
for (const p of vrfNoConn.slice(0, 10)) console.log(`    ${p.modelCode.padEnd(26)} ${meta(p).series}`)

console.log('\n════ G. 게시(PUBLISHED) 26건의 정체 ════')
for (const p of seed.products.filter((p) => p.status === 'PUBLISHED'))
  console.log(`  ${p.modelCode.padEnd(24)} ${meta(p).cat.padEnd(8)} ${meta(p).series}`)

// LG 스펙시트 50개 → 장비마스터 시드(public/equipment-seed.json + seedMeta.ts).
//   실행: npm run seed:build
//
// 정책 (주인님 확정 2026-07-09)
//  - 전량 적재하되 신규 모델은 DRAFT. 생성·검도가 쓰는 게시본은 기존 큐레이션 23종만 PUBLISHED.
//    (스펙시트에 실내기 장비번호가 없어 지어낼 수 없다 → 게시본은 장비번호를 가진 큐레이션 레코드가 담당)
//  - 큐레이션 모델이 스펙시트에도 있으면: hot 필드는 큐레이션(선정표 검증값) 우선, 롱테일 스펙은 시트에서 채운다.
//  - 마력(HP)은 모델명에서 유도하되, VRF 계열(Multi V·GHP·Water)만. 칠러·CDU·SINGLE은 모델명 숫자가 HP가 아니다.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import readXlsxFile from 'read-excel-file/node'

import { toParsedSheets, type WrappedSheet } from '../src/infrastructure/equipment/spec/specSheetRows'
import { horsepowerFromModelCode } from '../src/domain/equipment/ModelCode'
import { PUBLISH_STATUS } from '../src/domain/equipment/PublishStatus'
import { INDOOR_RECORDS, OUTDOOR_RECORDS } from '../src/infrastructure/equipment/seedData'
import type { SeedData, SeedProduct, SeedSeries, SeedSubcategory, SeedPrice } from '../src/infrastructure/equipment/seed/seedTypes'
import { CATEGORIES, classifySheet } from './taxonomy'

const SPEC_DIR = resolve('../03_참고자료/LG전자 스펙시트 모음')
const OUT_JSON = resolve('public/equipment-seed.json')
const OUT_META = resolve('src/infrastructure/equipment/seed/seedMeta.ts')

// 큐레이션 게시본이 속할 중분류. 라벨은 InMemory 시드(seedData.ts)의 type과 정확히 일치해야 한다
// — 생성/검도가 그 문자열을 실내기 유형으로 표시하고, 동치 테스트가 이를 고정한다.
const curatedIndoorSub = (type: string) => (type === '덕트' ? 'IN_DUCT_CURATED' : 'IN_4WAY')
const curatedOutdoorSub = (cat: string) => (cat === 'GHP' ? 'OUT_GHP' : cat === '냉방전용' ? 'OUT_CO' : 'OUT_HR')
const kwToW = (kw: number) => Math.round(kw * 1000)

async function main() {
  const files = readdirSync(SPEC_DIR).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'))

  const subcategories = new Map<string, SeedSubcategory>()
  const series = new Map<string, SeedSeries & { derivesHp: boolean }>()
  const products = new Map<string, SeedProduct>() // modelCode → product (첫 등장 우선)

  const skipped: string[] = []
  let sheetCount = 0

  for (const file of files.sort()) {
    const wrapped = (await readXlsxFile(resolve(SPEC_DIR, file))) as unknown as WrappedSheet[]
    for (const sheet of toParsedSheets(wrapped)) {
      const taxon = classifySheet(file, sheet.sheetName)
      if (!taxon) {
        skipped.push(`${file} | ${sheet.sheetName} (분류 불가)`)
        continue
      }
      sheetCount++

      if (!subcategories.has(taxon.subcategoryCode)) {
        subcategories.set(taxon.subcategoryCode, {
          code: taxon.subcategoryCode,
          categoryCode: taxon.categoryCode,
          nameKo: taxon.subcategoryName,
          energySource: taxon.energySource,
        })
      }
      if (!series.has(taxon.seriesCode)) {
        const mfl = /MFL(\d+)/.exec(file)
        series.set(taxon.seriesCode, {
          code: taxon.seriesCode,
          subcategoryCode: taxon.subcategoryCode,
          nameKo: taxon.seriesName,
          mflCode: mfl ? `MFL${mfl[1]}` : null,
          derivesHp: taxon.derivesHp,
        })
      }

      for (const p of sheet.products) {
        if (products.has(p.modelCode)) continue // 같은 모델이 여러 시트/파일에 있으면 첫 건 유지
        products.set(p.modelCode, {
          seriesCode: taxon.seriesCode,
          modelCode: p.modelCode,
          equipmentCode: null,
          horsepower: taxon.derivesHp ? horsepowerFromModelCode(p.modelCode) : null,
          coolingW: p.coolingW,
          heatingW: p.heatingW,
          maxConnections: p.maxConnections,
          efficiencyGradeId: null, // 시트의 효율 등급 행은 대부분 '-' → 추출하지 않는다
          copCooling: null,
          copHeating: null,
          status: PUBLISH_STATUS.DRAFT,
          specData: p.specData,
          source: `${file} | ${sheet.sheetName}`,
        })
      }
    }
  }

  // ── 큐레이션 게시본(생성·검도가 소비) 병합 ──
  const prices: SeedPrice[] = []
  const upsertCurated = (
    modelCode: string,
    subCode: string,
    seriesName: string,
    fields: Omit<SeedProduct, 'seriesCode' | 'modelCode' | 'status' | 'specData' | 'source'>,
    status: SeedProduct['status'],
  ) => {
    const seriesCode = `S_CURATED_${subCode}`
    if (!series.has(seriesCode)) {
      series.set(seriesCode, { code: seriesCode, subcategoryCode: subCode, nameKo: seriesName, mflCode: null, derivesHp: false })
    }
    const existing = products.get(modelCode)

    // 스펙시트에 있는 모델은 hot 필드(용량·HP·최대연결수)를 시트에서 취한다(주인님 결정 2026-07-09).
    //
    // 분류는 다르다. 목업 큐레이션의 장비번호 접미문자가 실제 유형과 어긋난다
    // (20C~72C는 '4WAY 카세트' 표기지만 시트상 프리미엄 1WAY, 40T~145T는 '덕트' 표기지만 4WAY 듀얼베인).
    // 생성·검도가 보는 유형 라벨을 바꾸지 않기 위해, 시트 중분류가 큐레이션과 다르면 큐레이션 시리즈에 붙인다.
    // (실외기는 시트와 큐레이션 중분류가 일치하므로 시트 시리즈를 그대로 쓴다.)
    const sheetSub = existing ? series.get(existing.seriesCode)!.subcategoryCode : null
    const keepSheetSeries = existing !== undefined && sheetSub === subCode

    products.set(modelCode, {
      seriesCode: keepSheetSeries ? existing.seriesCode : seriesCode,
      modelCode,
      equipmentCode: fields.equipmentCode,
      horsepower: existing ? existing.horsepower : fields.horsepower,
      coolingW: existing ? existing.coolingW : fields.coolingW,
      heatingW: existing ? existing.heatingW : fields.heatingW,
      maxConnections: existing ? existing.maxConnections : fields.maxConnections,
      efficiencyGradeId: fields.efficiencyGradeId, // 등급·COP는 큐레이션 값(시트 미추출)
      copCooling: fields.copCooling,
      copHeating: fields.copHeating,
      status,
      specData: existing?.specData ?? {},
      source: existing?.source ?? '큐레이션 시드(장비선정표 목업)',
    })
  }

  for (const r of INDOOR_RECORDS) {
    upsertCurated(
      r.model,
      curatedIndoorSub(r.type),
      `Multi V 실내기(큐레이션)`,
      { equipmentCode: r.code, horsepower: null, coolingW: r.coolW, heatingW: r.heatW, maxConnections: null, efficiencyGradeId: null, copCooling: null, copHeating: null },
      r.status,
    )
  }
  for (const r of OUTDOOR_RECORDS) {
    upsertCurated(
      r.model,
      curatedOutdoorSub(r.cat),
      `Multi V 실외기(큐레이션)`,
      {
        equipmentCode: null,
        horsepower: r.hp,
        coolingW: kwToW(r.cool),
        heatingW: r.heatKw === null ? null : kwToW(r.heatKw),
        maxConnections: r.maxConn,
        efficiencyGradeId: r.efficiencyGradeId,
        copCooling: r.copCooling,
        copHeating: r.copHeating,
      },
      r.status,
    )
    prices.push({
      modelCode: r.model,
      priceKrw: r.priceKrw,
      priceWithVatKrw: r.priceWithVatKrw,
      effectiveStartDate: r.effectiveStartDate,
      priority: r.priority,
    })
  }

  // 큐레이션이 붙인 중분류가 시트에 없었다면 보충(예: OUT_CO)
  const CURATED_SUBS: SeedSubcategory[] = [
    { code: 'IN_4WAY', categoryCode: 'INDOOR', nameKo: '4WAY 카세트', energySource: 'EHP' },
    { code: 'IN_DUCT_CURATED', categoryCode: 'INDOOR', nameKo: '덕트', energySource: 'EHP' },
    { code: 'OUT_HR', categoryCode: 'OUTDOOR', nameKo: '냉난방 절환형', energySource: 'EHP' },
    { code: 'OUT_CO', categoryCode: 'OUTDOOR', nameKo: '냉방전용', energySource: 'EHP' },
    { code: 'OUT_GHP', categoryCode: 'OUTDOOR', nameKo: 'GHP', energySource: 'GHP' },
  ]
  for (const s of CURATED_SUBS) if (!subcategories.has(s.code)) subcategories.set(s.code, s)

  // 적재 순서 = products.id 순서 = 생성/검도가 보는 PUBLISHED 목록 순서.
  // 큐레이션 게시본을 시드 정의 순서 그대로 먼저 넣어 InMemory 마스터와 순서까지 동치를 유지한다.
  const curatedOrder = [...INDOOR_RECORDS.map((r) => r.model), ...OUTDOOR_RECORDS.map((r) => r.model)]
  const curatedSet = new Set(curatedOrder)
  const ordered = [
    ...curatedOrder.map((m) => products.get(m)!),
    ...[...products.values()].filter((p) => !curatedSet.has(p.modelCode)).sort((a, b) => a.modelCode.localeCompare(b.modelCode)),
  ]

  const seed: SeedData = {
    hash: '',
    generatedFrom: `03_참고자료/LG전자 스펙시트 모음 (${files.length}개 파일, ${sheetCount}개 시트)`,
    categories: CATEGORIES,
    subcategories: [...subcategories.values()].sort((a, b) => a.code.localeCompare(b.code)),
    series: [...series.values()].map(({ derivesHp: _drop, ...s }) => s).sort((a, b) => a.code.localeCompare(b.code)),
    products: ordered,
    prices,
  }
  seed.hash = createHash('sha256').update(JSON.stringify({ ...seed, hash: '' })).digest('hex').slice(0, 16)

  mkdirSync(dirname(OUT_JSON), { recursive: true })
  writeFileSync(OUT_JSON, JSON.stringify(seed))
  mkdirSync(dirname(OUT_META), { recursive: true })
  writeFileSync(
    OUT_META,
    `// 자동 생성 — scripts/buildSpecSeed.ts (직접 수정 금지)\n` +
      `// IndexedDB 캐시 무효화 키. 시드 내용이 바뀌면 해시가 바뀌어 옛 캐시가 자연 무효화된다.\n` +
      `export const SEED_HASH = '${seed.hash}'\n` +
      `export const SEED_COUNTS = { products: ${seed.products.length}, series: ${seed.series.length}, subcategories: ${seed.subcategories.length} } as const\n`,
  )

  const byStatus = (s: string) => seed.products.filter((p) => p.status === s).length
  const noCapacity = seed.products.filter((p) => p.coolingW === null && p.heatingW === null).length
  const noHp = seed.products.filter((p) => p.horsepower === null).length
  console.log(`파일 ${files.length} · 시트 ${sheetCount} · 모델 ${seed.products.length}`)
  console.log(`  중분류 ${seed.subcategories.length} · 시리즈 ${seed.series.length}`)
  console.log(`  PUBLISHED ${byStatus('PUBLISHED')} · DRAFT ${byStatus('DRAFT')} · ARCHIVED ${byStatus('ARCHIVED')}`)
  console.log(`  용량 미상 ${noCapacity} · HP 미상 ${noHp}`)
  console.log(`  hash ${seed.hash} · ${(readFileSync(OUT_JSON).length / 1024 / 1024).toFixed(2)} MB`)
  if (skipped.length) {
    console.log(`\n분류 불가 ${skipped.length}건:`)
    for (const s of skipped) console.log('  -', s)
  }
}

await main()

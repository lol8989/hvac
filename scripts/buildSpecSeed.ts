// LG 스펙시트 50개 → 장비마스터 시드(public/equipment-seed.json + seedMeta.ts).
//   실행: npm run seed:build
//
// 정책 (주인님 확정 2026-07-09)
//  - 전량 적재하되 신규 모델은 DRAFT. 생성·검도가 쓰는 게시본은 기존 큐레이션 23종만 PUBLISHED.
//    (스펙시트에 실내기 장비번호가 없어 지어낼 수 없다 → 게시본은 장비번호를 가진 큐레이션 레코드가 담당)
//  - 큐레이션 모델이 스펙시트에도 있으면: hot 필드는 큐레이션(선정표 검증값) 우선, 롱테일 스펙은 시트에서 채운다.
//  - 마력(HP)은 모델명에서 유도하되, VRF 계열(Multi V·GHP·Water)만. 칠러·CDU·SINGLE은 모델명 숫자가 HP가 아니다.
//    비-VRF 실외기는 냉방용량 환산(÷2907)으로 백필한다(주인님 지시 2026-07-10, hpSource='DERIVED').
//    doc/05_설계결정/마력_환산식_적용_검토.md

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import readXlsxFile from 'read-excel-file/node'

import { toParsedSheets, type WrappedSheet } from '../src/infrastructure/equipment/spec/specSheetRows'
import type { HpSource } from '../src/domain/equipment/HpSource'
import { horsepowerFromModelCode } from '../src/domain/equipment/ModelCode'
import { horsepowerFromCapacityW } from '../src/domain/shared/Horsepower'
import { PUBLISH_STATUS } from '../src/domain/equipment/PublishStatus'
import { INDOOR_RECORDS, OUTDOOR_RECORDS } from '../src/infrastructure/equipment/seedData'
import type { SeedData, SeedProduct, SeedSeries, SeedSubcategory, SeedPrice, SeedCombination } from '../src/infrastructure/equipment/seed/seedTypes'
import { CATEGORIES, classifySheet } from './taxonomy'

const SPEC_DIR = resolve('../03_참고자료/LG전자 스펙시트 모음')
// 구형 .xls 10개는 Excel로 xlsx 변환(scripts/convertXls.ps1), zip 2개는 풀어서 하위 폴더에 둔다.
// read-excel-file이 .xls를 못 읽어 예전에는 14개 파일이 통째로 누락됐다(2026-07-14 전수조사).
const SPEC_DIRS = [SPEC_DIR, resolve(SPEC_DIR, 'xls_converted'), resolve(SPEC_DIR, 'zip_extracted')]
const OUT_JSON = resolve('public/equipment-seed.json')
const OUT_META = resolve('src/infrastructure/equipment/seed/seedMeta.ts')

// 원본 폴더의 모든 스펙 파일. .xls/.zip은 위 하위 폴더에 변환본이 있어야 한다.
interface SpecFile {
  dir: string
  name: string
}
function collectSpecFiles(): { files: SpecFile[]; unconverted: string[] } {
  const xlsx = new Map<string, SpecFile>() // 파일명(확장자 제외) → 파일
  for (const dir of SPEC_DIRS) {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue // 하위 폴더가 없을 수 있다
    }
    for (const name of entries) {
      if (!name.endsWith('.xlsx') || name.startsWith('~$')) continue
      const key = name.replace(/\.xlsx$/i, '')
      if (!xlsx.has(key)) xlsx.set(key, { dir, name })
    }
  }
  // 원본에 .xls/.zip이 있는데 변환본이 없으면 누락이다 — 조용히 넘어가지 않는다.
  const unconverted: string[] = []
  for (const name of readdirSync(SPEC_DIR)) {
    if (/\.xls$/i.test(name) && !xlsx.has(name.replace(/\.xls$/i, ''))) unconverted.push(name)
    if (/\.zip$/i.test(name)) {
      // zip은 내부 파일명을 알 수 없으니 추출 폴더가 비어 있으면 경고
      try {
        if (readdirSync(resolve(SPEC_DIR, 'zip_extracted')).length === 0) unconverted.push(name)
      } catch {
        unconverted.push(name)
      }
    }
  }
  return { files: [...xlsx.values()], unconverted }
}

// 큐레이션 게시본이 속할 중분류. 라벨은 InMemory 시드(seedData.ts)의 type과 정확히 일치해야 한다
// — 생성/검도가 그 문자열을 실내기 유형으로 표시하고, 동치 테스트가 이를 고정한다.
// 큐레이션 실내기의 중분류는 유형 라벨에서 나온다(1WAY=C · 2WAY=G · 4WAY=T 계열).
const curatedIndoorSub = (type: string) =>
  type.startsWith('1WAY') ? 'IN_1WAY' : type.startsWith('2WAY') ? 'IN_2WAY' : type === '덕트' ? 'IN_DUCT_CURATED' : 'IN_4WAY'
const curatedOutdoorSub = (cat: string) => (cat === 'GHP' ? 'OUT_GHP' : cat === '냉방전용' ? 'OUT_CO' : 'OUT_HR')
const kwToW = (kw: number) => Math.round(kw * 1000)

// 실외기 1건의 마력과 출처.
//   VRF     — 모델명 유도. 냉방용량을 함께 넘겨 100HP대(RP-Q1001X9S)를 10HP로 오독하지 않게 한다.
//   비-VRF  — 모델명 숫자가 용량이므로 유도 금지. 냉방용량 환산으로 백필한다.
// 실내기·환기는 마력 개념이 없다.
function resolveHp(categoryCode: string, isVrf: boolean, modelCode: string, coolingW: number | null): { hp: number | null; src: HpSource | null } {
  if (categoryCode !== 'OUTDOOR') return { hp: null, src: null }

  if (isVrf) {
    const hp = horsepowerFromModelCode(modelCode, coolingW)
    if (hp !== null) return { hp, src: 'MODEL_CODE' }
  }
  const derived = horsepowerFromCapacityW(coolingW)
  return derived === null ? { hp: null, src: null } : { hp: derived, src: 'DERIVED' }
}

async function main() {
  const { files, unconverted } = collectSpecFiles()
  files.sort((a, b) => a.name.localeCompare(b.name))

  const subcategories = new Map<string, SeedSubcategory>()
  const series = new Map<string, SeedSeries>()
  const products = new Map<string, SeedProduct>() // modelCode → product (첫 등장 우선)

  const skipped: string[] = []
  const emptyFiles: string[] = [] // 읽었는데 모델이 0건인 파일 — 파싱 실패 신호다
  const combinations: SeedCombination[] = [] // 단품 세트 — 제품이 아니라 조합
  let sheetCount = 0

  for (const { dir, name: file } of files) {
    const wrapped = (await readXlsxFile(resolve(dir, file))) as unknown as WrappedSheet[]
    const parsedSheets = toParsedSheets(wrapped)
    if (parsedSheets.length === 0) emptyFiles.push(file)

    for (const sheet of parsedSheets) {
      for (const s of sheet.sets) {
        combinations.push({ ...s, source: `${file} | ${sheet.sheetName}` })
      }
      // 세트만 실린 시트(조합 사양)는 제품이 없다 — 분류를 요구하지 않는다.
      if (sheet.products.length === 0) continue
      const taxon = classifySheet(file, sheet.sheetName)
      if (!taxon) {
        skipped.push(`${file} | ${sheet.sheetName} (분류 불가 · 모델 ${sheet.products.length}건 버려짐)`)
        continue
      }
      sheetCount++

      if (!subcategories.has(taxon.subcategoryCode)) {
        subcategories.set(taxon.subcategoryCode, {
          code: taxon.subcategoryCode,
          categoryCode: taxon.categoryCode,
          nameKo: taxon.subcategoryName,
        })
      }
      if (!series.has(taxon.seriesCode)) {
        const mfl = /MFL(\d+)/.exec(file)
        series.set(taxon.seriesCode, {
          code: taxon.seriesCode,
          subcategoryCode: taxon.subcategoryCode,
          nameKo: taxon.seriesName,
          mflCode: mfl ? `MFL${mfl[1]}` : null,
          isVrf: taxon.isVrf,
          energySource: taxon.energySource, // 계열은 시리즈에 실린다(중분류 버킷 오염 방지)
        })
      }

      for (const p of sheet.products) {
        if (products.has(p.modelCode)) continue // 같은 모델이 여러 시트/파일에 있으면 첫 건 유지
        const { hp, src } = resolveHp(taxon.categoryCode, taxon.isVrf, p.modelCode, p.coolingW)
        products.set(p.modelCode, {
          seriesCode: taxon.seriesCode,
          modelCode: p.modelCode,
          equipmentCode: null,
          horsepower: hp,
          hpSource: src,
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
    fields: Omit<SeedProduct, 'seriesCode' | 'modelCode' | 'status' | 'specData' | 'source' | 'hpSource'>,
    status: SeedProduct['status'],
  ) => {
    const seriesCode = `S_CURATED_${subCode}`
    if (!series.has(seriesCode)) {
      // 큐레이션 실외기는 생성·검도가 소비하는 Multi V/GHP 게시본이다 → VRF.
      // 계열: GHP 게시본만 GHP, 나머지(Multi V 실내기·실외기)는 EHP.
      series.set(seriesCode, {
        code: seriesCode,
        subcategoryCode: subCode,
        nameKo: seriesName,
        mflCode: null,
        isVrf: subCode.startsWith('OUT_'),
        energySource: subCode === 'OUT_GHP' ? 'GHP' : 'EHP',
      })
    }
    const existing = products.get(modelCode)

    // 스펙시트에 있는 모델은 hot 필드(용량·HP·최대연결수)를 시트에서 취한다(주인님 결정 2026-07-09).
    //
    // 분류는 다르다. 큐레이션 실내기는 항상 큐레이션 시리즈에 둔다 — 인메모리 시드(seedData.ts)가
    // 같은 시리즈명을 쓰고 동치 테스트가 이를 고정하기 때문이다. 실외기만 시트 시리즈를 그대로 쓴다.
    const sheetSub = existing ? series.get(existing.seriesCode)!.subcategoryCode : null
    const keepSheetSeries = existing !== undefined && sheetSub === subCode && subCode.startsWith('OUT_')

    products.set(modelCode, {
      seriesCode: keepSheetSeries ? existing.seriesCode : seriesCode,
      modelCode,
      equipmentCode: fields.equipmentCode,
      horsepower: existing ? existing.horsepower : fields.horsepower,
      hpSource: existing ? existing.hpSource : fields.horsepower === null ? null : 'CURATED',
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
    { code: 'IN_4WAY', categoryCode: 'INDOOR', nameKo: '4WAY 카세트' },
    { code: 'IN_DUCT_CURATED', categoryCode: 'INDOOR', nameKo: '덕트' },
    { code: 'OUT_HR', categoryCode: 'OUTDOOR', nameKo: '냉난방 절환형' },
    { code: 'OUT_CO', categoryCode: 'OUTDOOR', nameKo: '냉방전용' },
    { code: 'OUT_GHP', categoryCode: 'OUTDOOR', nameKo: 'GHP' },
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
    series: [...series.values()].sort((a, b) => a.code.localeCompare(b.code)),
    products: ordered,
    prices,
    combinations,
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
  const bySource = (s: HpSource) => seed.products.filter((p) => p.hpSource === s).length
  const noCapacity = seed.products.filter((p) => p.coolingW === null && p.heatingW === null).length
  const vrfSeries = new Set(seed.series.filter((s) => s.isVrf).map((s) => s.code))
  // 실외기만 HP 대상이다 — 실내기·환기의 null은 정상이므로 세지 않는다.
  const subCategory = new Map(seed.subcategories.map((s) => [s.code, s.categoryCode]))
  const seriesCategory = new Map(seed.series.map((s) => [s.code, subCategory.get(s.subcategoryCode)!]))
  const outdoorNoHp = seed.products.filter((p) => seriesCategory.get(p.seriesCode) === 'OUTDOOR' && p.horsepower === null).length
  console.log(`파일 ${files.length} · 시트 ${sheetCount} · 모델 ${seed.products.length}`)
  console.log(`  중분류 ${seed.subcategories.length} · 시리즈 ${seed.series.length} (VRF ${vrfSeries.size})`)
  console.log(`  PUBLISHED ${byStatus('PUBLISHED')} · DRAFT ${byStatus('DRAFT')} · ARCHIVED ${byStatus('ARCHIVED')}`)
  console.log(`  HP 출처: 모델명 ${bySource('MODEL_CODE')} · 환산백필 ${bySource('DERIVED')} · 큐레이션 ${bySource('CURATED')}`)
  console.log(`  용량 미상 ${noCapacity} · HP 미상(실외기, 용량 없어 백필 불가) ${outdoorNoHp}`)
  console.log(`  hash ${seed.hash} · ${(readFileSync(OUT_JSON).length / 1024 / 1024).toFixed(2)} MB`)
  if (combinations.length) {
    console.log(`  단품 세트(제품 아님, 조합) ${combinations.length}건 — 예: ${combinations[0].setCode}`)
  }
  if (skipped.length) {
    console.log(`\n분류 불가 ${skipped.length}건:`)
    for (const s of skipped) console.log('  -', s)
  }

  // ── 커버리지 가드 ──
  // 조용한 누락을 금지한다. 예전에는 .xls 10 · zip 2 · 파싱실패 2 = 14개 파일이
  // 경고 한 줄 없이 빠졌고, 아무도 몰랐다(doc/05_설계결정/시드_적재_전수조사_2026-07-14.md).
  const problems: string[] = []
  if (unconverted.length) {
    problems.push(`변환본이 없는 원본 ${unconverted.length}건 (.xls는 xls_converted/, .zip은 zip_extracted/에 풀어 둔다)`)
    for (const f of unconverted) console.error(`  ✗ 변환 안 됨: ${f}`)
  }
  if (emptyFiles.length) {
    problems.push(`읽었지만 모델 0건인 파일 ${emptyFiles.length}건 (파싱 실패)`)
    for (const f of emptyFiles) console.error(`  ✗ 모델 0건: ${f}`)
  }
  if (skipped.length) {
    problems.push(`분류 불가 시트 ${skipped.length}건 (taxonomy.ts에 규칙이 없다)`)
  }
  if (problems.length) {
    console.error(`\n✗ 시드 커버리지 결함 — 원본이 시드에 온전히 들어가지 않았다:`)
    for (const p of problems) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  console.log(`\n✓ 커버리지 정상 — 원본 스펙 파일 ${files.length}개가 모두 시드에 반영됐다.`)
}

await main()

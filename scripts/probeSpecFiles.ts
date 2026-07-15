// 진단용: 스펙시트 폴더(원본 + 변환본 + zip 추출본)의 모든 파일에 대해
// 시트명 · 분류 결과 · 파싱된 모델 수를 찍는다. 0건 파일의 원인을 찾기 위한 도구.
//   실행: npx vite-node scripts/probeSpecFiles.ts [파일명 필터]
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import readXlsxFile from 'read-excel-file/node'
import { toParsedSheets, parseSpecRows, isModelCode, type WrappedSheet } from '../src/infrastructure/equipment/spec/specSheetRows'
import { classifySheet } from './taxonomy'

const ROOT = resolve('../03_참고자료/LG전자 스펙시트 모음')
const DIRS = [ROOT, resolve(ROOT, 'xls_converted'), resolve(ROOT, 'zip_extracted')]
const filter = process.argv[2] ?? ''

for (const dir of DIRS) {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'))
  } catch {
    continue
  }
  for (const file of files.sort()) {
    if (filter && !file.includes(filter)) continue
    const wrapped = (await readXlsxFile(resolve(dir, file))) as unknown as WrappedSheet[]
    const parsed = toParsedSheets(wrapped)
    const total = parsed.reduce((n, s) => n + s.products.length, 0)
    const mark = total === 0 ? '✗' : ' '
    console.log(`${mark} [${total.toString().padStart(4)}건] ${file}`)
    for (const w of wrapped) {
      const prods = parseSpecRows(w.data)
      const taxon = classifySheet(file, w.sheet)
      const cls = taxon ? `${taxon.categoryCode}/${taxon.subcategoryCode}/${taxon.seriesName}` : '※ 분류불가'
      console.log(`      시트 "${w.sheet}" → 모델 ${prods.length}건 · ${cls}`)
      if (prods.length === 0) {
        // 왜 0건인가 — 앞 8행에서 모델코드처럼 보이는 셀을 찾아본다
        for (let r = 0; r < Math.min(w.data.length, 8); r++) {
          const cells = w.data[r].map((v) => (v == null ? '' : String(v).trim()))
          const hits = cells.filter((c) => isModelCode(c))
          console.log(`        row${r}: 모델후보 ${hits.length}개  ${cells.slice(0, 8).map((c) => c.slice(0, 14)).join(' | ')}`)
        }
      }
    }
  }
}

// 장비일람표 xlsx 출력. 계열별 시트(실내기 / 실외기(EHP) / 실외기(GHP)).
//
// 컬럼이 24~31개라 CSV로는 읽기 어렵다(주인님 확정 2026-07-10: xlsx + 계열별 시트).
// 브라우저에서 파일을 만든다 — POC라 서버 워커가 없다.

// 루트 진입점이 없다 — 환경별 서브패스를 써야 한다(node/browser/universal).
import writeXlsxFile from 'write-excel-file/browser'
import type { Sheet } from 'write-excel-file/browser'
import type { ScheduleSheet } from './scheduleTable'

type FileContent = File | Blob | ArrayBuffer

const HEADER_BG = '#F2EEF0'

// 헤더 1행 + 데이터. 값은 전부 문자열이다(정본이 '6.35'·'2.5x3C'처럼 단위·기호를 섞는다).
const toCells = (sheet: ScheduleSheet) => [
  sheet.columns.map((c) => ({ value: c, fontWeight: 'bold' as const, backgroundColor: HEADER_BG })),
  ...sheet.rows.map((row) => row.map((v) => ({ value: v }))),
]

// 컬럼 폭: 헤더/값 중 가장 긴 문자열에 맞춘다(과도하게 넓어지지 않게 상한).
const widthsOf = (sheet: ScheduleSheet): { width: number }[] =>
  sheet.columns.map((c, i) => {
    const longest = Math.max(c.length, ...sheet.rows.map((r) => (r[i] ?? '').length))
    return { width: Math.min(28, Math.max(8, longest + 2)) }
  })

// 브라우저 빌드는 fileName 옵션을 받지 않는다 — toBlob()/toFile()을 돌려준다.
// 시트가 없으면 파일을 만들지 않는다(빈 통합문서를 내려받게 하지 않는다).
export async function downloadScheduleXlsx(sheets: readonly ScheduleSheet[], fileName = '장비일람표.xlsx'): Promise<boolean> {
  if (!sheets.length) return false

  const workbook: Sheet<FileContent>[] = sheets.map((s) => ({
    data: toCells(s),
    sheet: s.name,
    columns: widthsOf(s),
    stickyRowsCount: 1, // 헤더 고정 — 컬럼이 많아 가로 스크롤이 잦다
  }))

  await writeXlsxFile(workbook).toFile(fileName)
  return true
}

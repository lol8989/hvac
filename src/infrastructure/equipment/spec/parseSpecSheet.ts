// 브라우저 File → 시트별 ParsedProduct[]. xlsx 라이브러리 경계는 이 파일에만 둔다
// (순수 파싱은 specSheetRows.parseSpecRows/toParsedSheets — 노드 테스트에서 라이브러리 없이 검증 가능).

// 이 패키지는 루트 export가 없다 — 브라우저 진입점을 명시한다(노드 테스트는 'read-excel-file/node' 사용).
import readXlsxFile from 'read-excel-file/browser'
import { toParsedSheets, type ParsedSheet, type WrappedSheet } from './specSheetRows'

export type { ParsedSheet }

export async function parseSpecSheetFile(file: File): Promise<ParsedSheet[]> {
  const sheets = (await readXlsxFile(file)) as unknown as WrappedSheet[]
  return toParsedSheets(sheets)
}

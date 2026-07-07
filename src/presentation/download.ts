// 브라우저 파일 다운로드 헬퍼(Blob + 앵커). 산출물(CSV·SVG) 저장에 사용.

export const CSV_BOM = String.fromCharCode(0xfeff) // Excel이 UTF-8 CSV를 올바르게 열도록 BOM 부착

export const downloadText = (filename: string, content: string, mime = 'text/plain;charset=utf-8'): void => {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

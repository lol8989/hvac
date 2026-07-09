// LG 스펙시트(xlsx) 일괄 업로드 모달. Figma ADM-EQP-001 (상세2 - 엑셀 업로드 파일 선택 완료) 레이아웃 참고.
// 원본 스펙시트를 그대로 파싱하므로 「템플릿 다운로드」 단계는 없다.
// 흐름: 시리즈 선택 → 파일 선택 → 즉시 파싱·검증 요약(미리보기) → 업로드(정상 행만 DRAFT 적재).

import { useState } from 'react'
import type { SeriesOption } from '../../application/equipment/adminPorts'
import { classifyImport, type ImportPreview, type ImportRow } from '../../domain/equipment/SpecImport'
import { parseSpecSheetFile, type ParsedSheet } from '../../infrastructure/equipment/spec/parseSpecSheet'
import { useSubmitGuard } from './useSubmitGuard'

const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

export interface SpecSheetUploadModalProps {
  series: SeriesOption[]
  existingModelCodes: string[]
  onImport: (seriesCode: string, rows: readonly ImportRow[]) => number // 적재 건수 반환
  onClose: () => void
  parseFile?: (file: File) => Promise<ParsedSheet[]> // 테스트 주입용
}

interface Loaded {
  file: File
  sheets: ParsedSheet[]
  preview: ImportPreview
}

export default function SpecSheetUploadModal({
  series,
  existingModelCodes,
  onImport,
  onClose,
  parseFile = parseSpecSheetFile,
}: SpecSheetUploadModalProps) {
  const [seriesCode, setSeriesCode] = useState(series[0]?.code ?? '')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const pick = useSubmitGuard() // 파일 파싱 중 재선택 방지
  const submit = useSubmitGuard() // 업로드 더블클릭 방지

  const isOutdoor = series.find((s) => s.code === seriesCode)?.categoryCode === 'OUTDOOR'

  // 시리즈를 바꾸면 실내/실외가 달라져 HP 검증 결과가 뒤집힌다 → 같은 파일을 재분류한다.
  const classify = (sheets: ParsedSheet[], outdoor: boolean) =>
    classifyImport(
      sheets.flatMap((s) => s.products),
      { isOutdoor: outdoor, existingModelCodes },
    )

  const onSeriesChange = (code: string) => {
    setSeriesCode(code)
    const outdoor = series.find((s) => s.code === code)?.categoryCode === 'OUTDOOR'
    setLoaded((cur) => (cur ? { ...cur, preview: classify(cur.sheets, outdoor) } : cur))
  }

  const onFile = (file: File | undefined) =>
    void pick.run(async () => {
      setError('')
      if (!file) return
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        setError('xlsx 파일만 업로드할 수 있습니다')
        return
      }
      if (file.size > MAX_BYTES) {
        setError('파일이 너무 큽니다 (최대 10MB)')
        return
      }
      try {
        const sheets = await parseFile(file)
        if (!sheets.length) {
          setError('스펙시트에서 모델을 찾지 못했습니다. LG 스펙시트 원본인지 확인하세요.')
          setLoaded(null)
          return
        }
        setLoaded({ file, sheets, preview: classify(sheets, isOutdoor) })
      } catch {
        setError('엑셀 파일을 읽지 못했습니다. 손상되지 않았는지 확인하세요.')
        setLoaded(null)
      }
    })

  const upload = () =>
    void submit.run(() => {
      if (!loaded || loaded.preview.ok === 0) return
      try {
        onImport(seriesCode, loaded.preview.rows)
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : '업로드에 실패했습니다')
      }
    })

  const p = loaded?.preview
  const modelCount = p?.total ?? 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal eq-upload" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="장비 엑셀 일괄 업로드">
        <div className="m-h">
          <span className="mt">장비 엑셀 일괄 업로드</span>
          <button className="x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="eq-form-body">
          <section className="up-sec">
            <h4>1. 등록할 시리즈 선택</h4>
            <p className="up-help">업로드한 모델은 이 시리즈 아래에 <b>작성중(DRAFT)</b>으로 등록됩니다. 게시해야 생성·검도에 노출됩니다.</p>
            <select className="field" value={seriesCode} onChange={(e) => onSeriesChange(e.target.value)} aria-label="시리즈">
              {series.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.categoryName} · {s.subcategoryName} — {s.nameKo}
                </option>
              ))}
            </select>
          </section>

          <section className="up-sec">
            <h4>2. 파일 업로드</h4>
            <p className="up-help">LG전자 스펙시트 원본(xlsx, 최대 10MB)을 그대로 올리세요. 별도 양식 변환이 필요 없습니다.</p>

            {!loaded ? (
              <label className="up-drop">
                <input
                  type="file"
                  accept=".xlsx"
                  aria-label="스펙시트 파일"
                  onChange={(e) => onFile(e.target.files?.[0])}
                  disabled={pick.busy}
                />
                <span>{pick.busy ? '읽는 중…' : '스펙시트 파일 선택 (.xlsx)'}</span>
              </label>
            ) : (
              <>
                <div className="up-file">
                  <span className="up-ext">XLSX</span>
                  <div className="up-meta">
                    <div className="up-name">{loaded.file.name}</div>
                    <div className="up-sub">
                      {kb(loaded.file.size)} · {modelCount}개 모델 감지됨
                      {loaded.sheets.length > 1 ? ` · 시트 ${loaded.sheets.length}개` : ''}
                    </div>
                  </div>
                  <button className="selrow-x" onClick={() => setLoaded(null)} aria-label="선택한 파일 지우기">×</button>
                </div>
                <label className="btn sm up-repick">
                  <input type="file" accept=".xlsx" aria-label="파일 다시 선택" onChange={(e) => onFile(e.target.files?.[0])} />
                  파일 다시 선택
                </label>
              </>
            )}
          </section>

          {p && (
            <section className="up-sec">
              <h4>검증 요약 (업로드 전 미리보기)</h4>
              <div className="up-summary">
                <div><span>총 모델 수</span><b>{p.total}</b></div>
                <div><span>정상 (등록 대상)</span><b>{p.ok}건</b></div>
                <div><span>오류 (스킵)</span><b>{p.error}건</b></div>
                <div><span>중복 (스킵)</span><b>{p.duplicate}건</b></div>
              </div>
              <p className="up-note">
                ※ 오류·중복 행은 업로드에서 제외됩니다. {isOutdoor ? '실외기 마력(HP)은 모델명에서 유도합니다.' : '실내기는 마력을 요구하지 않습니다.'}
              </p>
              {p.ok === 0 && <div className="eq-form-err" role="alert">등록할 수 있는 모델이 없습니다.</div>}
              {p.rows.some((r) => r.verdict !== 'OK') && (
                <ul className="up-reasons">
                  {p.rows
                    .filter((r) => r.verdict !== 'OK')
                    .slice(0, 5)
                    .map((r, i) => (
                      <li key={i}>
                        <b>{r.product.modelCode || '(모델명 없음)'}</b> — {r.reason}
                      </li>
                    ))}
                  {p.rows.filter((r) => r.verdict !== 'OK').length > 5 && <li>…외 {p.rows.filter((r) => r.verdict !== 'OK').length - 5}건</li>}
                </ul>
              )}
            </section>
          )}

          {error && <div className="eq-form-err" role="alert">{error}</div>}
        </div>

        <div className="eq-form-foot">
          <button className="btn" onClick={onClose} disabled={submit.busy}>취소</button>
          <button className="btn primary" onClick={upload} disabled={submit.busy || !p || p.ok === 0}>
            {submit.busy ? '업로드 중…' : `업로드${p && p.ok ? ` (${p.ok}건)` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

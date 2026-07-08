import './selection.css'
import type { SelectionTable } from '../../domain/generation/SelectionTable'
import SelectionRowView from './SelectionRowView'
import type { SelectionRowViewProps } from './SelectionRowView'
import SelectionBomView from './SelectionBomView'

const w = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })

export interface SelectionGridProps extends Omit<SelectionRowViewProps, 'row' | 'floorSpan'> {
  table: SelectionTable
}

// 장비선정표 검토 그리드 — 행=실, 층 섹션+합계, 하단 BOM.
// AI 기본값 셀([AI] 뱃지)과 사용자 수정 셀([수정]+↺)을 구분 표시한다.
export default function SelectionGrid({ table, ...rowProps }: SelectionGridProps) {
  return (
    <div className="selgrid-wrap">
      <div className="selgrid-title">
        장비선정표 검토
        <span className="hint">셀을 수정하면 하류 값이 재계산됩니다 · 수정 셀은 AI 재선정에도 보존</span>
      </div>
      <table className="selgrid">
        <thead>
          <tr>
            <th rowSpan={2}>층별</th><th rowSpan={2}>실명</th><th rowSpan={2}>면적<br />(㎡)</th>
            <th colSpan={2}>단위부하(kcal/h·㎡)</th><th colSpan={2}>필요부하량(W)</th>
            <th rowSpan={2}>장비<br />번호</th><th rowSpan={2}>실내기 모델명</th>
            <th rowSpan={2}>냉방용량<br />(W)</th><th rowSpan={2}>난방용량<br />(W)</th><th rowSpan={2}>대수</th>
            <th rowSpan={2}>총냉방<br />(W)</th><th rowSpan={2}>총난방<br />(W)</th>
            <th rowSpan={2}>그룹</th><th rowSpan={2}>실외기<br />(HP)</th><th rowSpan={2}>실외기 모델명</th>
            <th rowSpan={2}>실외기냉방<br />(W)</th><th rowSpan={2}>실외기난방<br />(W)</th><th rowSpan={2}>조합비</th>
          </tr>
          <tr><th>냉방</th><th>난방</th><th>냉방</th><th>난방</th></tr>
        </thead>
        <tbody>
          {table.floors.map((section) => (
            [
              ...section.rows.map((row, i) => (
                <SelectionRowView
                  key={row.roomId}
                  row={row}
                  floorSpan={i === 0 ? section.rows.length + 1 : null}
                  {...rowProps}
                />
              )),
              <tr className="subtotal" key={`${section.floor}-subtotal`}>
                <td className="t">합계</td>
                <td colSpan={9} />
                <td className="c">{section.subtotal.quantity}</td>
                <td>{w(section.subtotal.totalCoolW)}</td>
                <td>{w(section.subtotal.totalHeatW)}</td>
                <td colSpan={6} />
              </tr>,
            ]
          ))}
        </tbody>
      </table>
      <SelectionBomView bom={table.bom} />
    </div>
  )
}

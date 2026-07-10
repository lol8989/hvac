import './selection.css'
import type { SelectionTable } from '../../domain/generation/SelectionTable'
import SelectionRowView from './SelectionRowView'
import type { SelectionRowViewProps } from './SelectionRowView'
import SelectionBomView from './SelectionBomView'

const w = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 1 })
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`

export interface SelectionGridProps extends Omit<SelectionRowViewProps, 'row' | 'floorSpan' | 'rowClass'> {
  table: SelectionTable
}

// 장비선정표 검토 그리드 — 층 섹션 > 실외기 그룹 소섹션 > 실 행 (주인님 지시 2026-07-10).
//
// 같은 실외기에 엮인 실이 한눈에 묶여 보여야 한다 → 그룹마다 굵은 기준선으로 끊고
// 그룹 소계 행에 조합비를 놓는다. 조합비는 행이 아니라 그룹의 성질이다.
// (Confluence: "한 실외기가 여러 층에 걸치지 않는다" → 그룹은 항상 한 층 안에 있다.)
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
          {table.floors.map((section) => {
            // 층 셀 rowSpan: 실 행 + 그룹 소계 행 + (미배정 안내 행) + 층 합계 행
            const floorSpan = section.rows.length + section.groups.length + (section.unassigned.length ? 1 : 0) + 1
            let firstRow = true
            const spanOf = () => {
              if (!firstRow) return null
              firstRow = false
              return floorSpan
            }

            return [
              // 그룹별 묶음 — 첫 행에 굵은 기준선(group-start)
              ...section.groups.flatMap((g) => [
                ...g.rows.map((row, i) => (
                  <SelectionRowView key={row.roomId} row={row} floorSpan={spanOf()} rowClass={i === 0 ? 'group-start' : undefined} {...rowProps} />
                )),
                <tr className="group-subtotal" key={`${g.key}-subtotal`}>
                  {/* 층 셀은 rowSpan이 덮으므로 이 행은 19칸이다: 1 + 9 + 3 + 6 */}
                  <td className="t">{g.label} 소계</td>
                  <td colSpan={9} />
                  <td className="c">{g.subtotal.quantity}</td>
                  <td>{w(g.subtotal.totalCoolW)}</td>
                  <td>{w(g.subtotal.totalHeatW)}</td>
                  <td className="t">{g.label}</td>
                  <td className="c">{g.outdoor.hp}HP</td>
                  <td className="t">{g.outdoor.model}</td>
                  <td>{w(g.outdoor.coolKw * 1000)}</td>
                  <td>{g.outdoor.heatKw !== null ? w(g.outdoor.heatKw * 1000) : '—'}</td>
                  <td className={g.outdoor.judgement === 'OK' ? 'combo-ok' : 'combo-warn'}>
                    {pct(g.outdoor.comboRatio)}
                    {g.outdoor.judgement !== 'OK' && (
                      <span className="badge warn">{g.outdoor.judgement === 'OVERLOADED' ? '과부하' : '저부하'}</span>
                    )}
                  </td>
                </tr>,
              ]),

              // 아직 실외기에 배정되지 않은 실 — 그룹 아래에 따로 모은다
              ...(section.unassigned.length
                ? [
                    ...section.unassigned.map((row, i) => (
                      <SelectionRowView key={row.roomId} row={row} floorSpan={spanOf()} rowClass={i === 0 ? 'group-start unassigned' : 'unassigned'} {...rowProps} />
                    )),
                    <tr className="group-subtotal unassigned" key={`${section.floor}-unassigned`}>
                      <td className="t" colSpan={13}>미배정 {section.unassigned.length}실 — 실외기 조합 매핑에서 배정하세요</td>
                      <td colSpan={6} />
                    </tr>,
                  ]
                : []),

              <tr className="subtotal" key={`${section.floor}-subtotal`}>
                <td className="t">{section.floor} 합계</td>
                <td colSpan={9} />
                <td className="c">{section.subtotal.quantity}</td>
                <td>{w(section.subtotal.totalCoolW)}</td>
                <td>{w(section.subtotal.totalHeatW)}</td>
                <td colSpan={6} />
              </tr>,
            ]
          })}
        </tbody>
      </table>
      <SelectionBomView bom={table.bom} />
    </div>
  )
}

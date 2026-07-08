import type { SelectionBom } from '../../domain/generation/SelectionTable'

// 장비선정표 하단 집계(BOM): 실내기 모델별 대수 / 실외기 모델별 대수 + HP 합계.
export default function SelectionBomView({ bom }: { bom: SelectionBom }) {
  return (
    <div className="selbom">
      <div>
        <div className="ttl">실내기 집계</div>
        <table>
          <thead>
            <tr><th>장비번호</th><th>모델명</th><th>대수</th></tr>
          </thead>
          <tbody>
            {bom.indoor.map((r) => (
              <tr key={r.code}><td>{r.code}</td><td>{r.model}</td><td style={{ textAlign: 'right' }}>{r.quantity}</td></tr>
            ))}
            <tr className="hp-total"><td colSpan={2}>합계</td><td style={{ textAlign: 'right' }}>{bom.indoorTotal}</td></tr>
          </tbody>
        </table>
      </div>
      <div>
        <div className="ttl">실외기 집계</div>
        <table>
          <thead>
            <tr><th>HP</th><th>모델명</th><th>대수</th></tr>
          </thead>
          <tbody>
            {bom.outdoor.map((r) => (
              <tr key={r.model}><td>{r.hp}HP</td><td>{r.model}</td><td style={{ textAlign: 'right' }}>{r.quantity}</td></tr>
            ))}
            <tr className="hp-total"><td>HP 합계</td><td /><td style={{ textAlign: 'right' }}>{bom.hpTotal}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

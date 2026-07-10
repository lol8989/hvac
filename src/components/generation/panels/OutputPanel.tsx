// 산출물 단계의 컨텍스트 패널.
//
// 예전에는 중앙 카드(StepOverlay)가 뷰어를 통째로 덮어서, 도면 산출물을 보면서 내려받을 수 없었다.
// 생성 메뉴의 목적이 장비선정표·장비일람표를 뽑는 것이므로 그 둘을 맨 위에 둔다.

interface OutputPanelProps {
  generated: boolean
  roomCount: number
  outdoorCount: number
  hpTotal: number
  onDownloadSelection: () => void
  onDownloadSchedule: () => void
  onDownloadDrawing: () => void
}

export default function OutputPanel({
  generated, roomCount, outdoorCount, hpTotal,
  onDownloadSelection, onDownloadSchedule, onDownloadDrawing,
}: OutputPanelProps) {
  return (
    <>
      <div className="rp-room">
        <span>설치 실 · 실외기</span>
        <span>{roomCount}곳 · {outdoorCount}대</span>
      </div>
      <div className="rp-room">
        <span>총 마력</span>
        <span>{hpTotal}HP</span>
      </div>

      <div className="subttl" style={{ marginTop: 12 }}>산출물</div>
      {!generated ? (
        <div className="rp-empty">
          <b>장비선정표·도면 생성</b>을 누르면
          <br />
          산출물을 내려받을 수 있습니다.
        </div>
      ) : (
        <div className="out-list">
          <button className="btn" onClick={onDownloadSelection}>⭳ 장비선정표.csv</button>
          <button className="btn" onClick={onDownloadSchedule}>⭳ 장비일람표.xlsx</button>
          <button className="btn" onClick={onDownloadDrawing}>⭳ 도면.svg</button>
        </div>
      )}
    </>
  )
}

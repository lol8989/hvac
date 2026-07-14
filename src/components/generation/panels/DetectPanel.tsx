// 실 검출 단계의 컨텍스트 패널 — 검출 결과 확인.
// 검출 전에는 무엇을 하는 단계인지, 검출 후에는 무엇이 잡혔는지 보여준다.

import type { Room } from '../../../data'

interface DetectPanelProps {
  rooms: Record<string, Room>
  facility: string
}

export default function DetectPanel({ rooms, facility }: DetectPanelProps) {
  const ids = Object.keys(rooms)
  if (ids.length === 0) {
    return (
      <div className="rp-empty">
        아직 검출된 실이 없습니다.
        <br />
        시설군을 확인한 뒤 <b>실 검출 실행</b>을 누르세요.
      </div>
    )
  }

  const totalArea = ids.reduce((a, id) => a + rooms[id].area, 0)
  const totalLoad = ids.reduce((a, id) => a + rooms[id].cool, 0)

  return (
    <>
      <div className="rp-room">
        <span>시설군</span>
        <span>{facility}</span>
      </div>
      <div className="rp-room">
        <span>검출 실 · 총 면적</span>
        <span>{ids.length}곳 · {totalArea.toFixed(1)}㎡</span>
      </div>
      <div className="rp-room">
        <span>총 냉방부하</span>
        <span>{totalLoad.toFixed(1)}kW</span>
      </div>

      <div className="subttl" style={{ marginTop: 12 }}>검출된 실</div>
      {ids.map((id) => (
        <div key={id} className="selrow">
          <span className="selrow-main">
            <span className="selrow-top">{id} <span style={{ color: '#999' }}>· {rooms[id].name}</span></span>
            <span className="selrow-idu">{rooms[id].area.toFixed(1)}㎡ · {rooms[id].cool.toFixed(1)}kW</span>
          </span>
          <span className="rt">{rooms[id].usage}</span>
        </div>
      ))}
    </>
  )
}

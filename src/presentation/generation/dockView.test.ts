// dockView: SelectionTable → 층 → 실외기 → 실 매핑. 계산은 하지 않고 옮기기만 한다.
import { describe, it, expect } from 'vitest'
import { buildDockView, allUnassigned } from './dockView'
import type { SelectionTable, SelectionRow } from '../../domain/generation/SelectionTable.types'

const row = (over: Partial<SelectionRow> & { roomId: string; roomName: string }): SelectionRow => ({
  floor: '2F',
  usageMatch: 'exact',
  areaM2: 55,
  unitLoad: { coolKcal: 150, heatKcal: 0, coolW: 0, heatW: 0, overridden: false, reasonableCoolKcal: null },
  requiredW: { cool: 9600, heat: 0 },
  indoor: { code: 'RNW0320M2S', model: 'RNW0320M2S', type: '4WAY', coolW: 3200, heatW: 0, quantity: 3, totalCoolW: 9600, totalHeatW: 0, overridden: false },
  group: null,
  outdoor: null,
  ...over,
})

const TABLE: SelectionTable = {
  floors: [
    {
      floor: '2F',
      rows: [],
      groups: [
        {
          key: 'ODU1',
          label: '실외기-1',
          rows: [
            row({ roomId: 'AC_005', roomName: '로비', areaM2: 55, requiredW: { cool: 9600, heat: 0 } }),
            row({
              roomId: 'AC_004', roomName: '사무실', areaM2: 42, requiredW: { cool: 7200, heat: 0 },
              indoor: { code: 'RNW0320M2S', model: 'RNW0320M2S', type: '4WAY', coolW: 7200, heatW: 0, quantity: 1, totalCoolW: 7200, totalHeatW: 0, overridden: false },
            }),
          ],
          subtotal: { quantity: 4, totalCoolW: 16800, totalHeatW: 0 },
          outdoor: { hp: 12, model: 'RPUW141XDF', coolKw: 39.2, heatKw: 44, quantity: 1, comboRatio: 0.95, judgement: 'OK' },
        },
      ],
      unassigned: [
        row({ roomId: 'AC_002', roomName: '침실1', areaM2: 18.5, requiredW: { cool: 4000, heat: 0 }, indoor: null }),
      ],
      subtotal: { quantity: 4, totalCoolW: 16800, totalHeatW: 0 },
    },
  ],
  bom: { indoor: [], outdoor: [], indoorTotal: 0, outdoorTotal: 0, hpTotal: 0 },
}

describe('buildDockView — 층 → 실외기 → 실 계층', () => {
  const view = buildDockView(TABLE)

  it('층 섹션을 만든다', () => {
    expect(view).toHaveLength(1)
    expect(view[0].floor).toBe('2F')
  })

  it('실외기 헤더에 모델·HP·용량·조합비·판정·연결대수·실수를 담는다', () => {
    const g = view[0].groups[0]
    expect(g).toMatchObject({ key: 'ODU1', label: '실외기-1', model: 'RPUW141XDF', hp: 12, coolKw: 39.2, ratio: 0.95, judgement: 'OK' })
    expect(g.unitCount).toBe(4) // 로비 ×3 + 사무실 ×1
    expect(g.roomCount).toBe(2)
  })

  it('실 행에 면적·칼로리·부하·모델·대수를 담는다', () => {
    const lobby = view[0].groups[0].rooms[0]
    expect(lobby).toEqual({
      roomId: 'AC_005', name: '로비', areaM2: 55, coolKcal: 150, loadKw: 9.6, model: 'RNW0320M2S', qty: 3,
    })
  })

  it('실내기 미지정 실은 모델 null·대수 0으로 옮긴다', () => {
    const un = view[0].unassigned[0]
    expect(un.name).toBe('침실1')
    expect(un.model).toBeNull()
    expect(un.qty).toBe(0)
  })

  it('allUnassigned는 층을 가로질러 미배정 실을 모은다', () => {
    expect(allUnassigned(view).map((r) => r.roomId)).toEqual(['AC_002'])
  })
})

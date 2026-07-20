/** @vitest-environment jsdom */
// 장비선정표 새 창 — 연결 대기 → 스냅샷 수신 렌더 → 편집 커맨드 송신 검증.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SelectionReviewWindow from './SelectionReviewWindow'
import { FakeBroadcastChannel } from '../../test/fakeBroadcastChannel'
import { SELECTION_CHANNEL } from '../../presentation/generation/selectionSync'
import type { SelectionEditMsg } from '../../presentation/generation/selectionSync'
import { buildSelectionTable } from '../../domain/generation/SelectionTable'
import { Room } from '../../domain/generation/Room'
import { Placement } from '../../domain/generation/Placement'
import { POS } from '../../test/positions'
import { IndoorModel } from '../../domain/generation/IndoorModel'

const table = buildSelectionTable({
  rooms: [Room.create({ id: 'R1', floor: '지하1층', name: '시청각실', areaM2: 20, usage: '시청각실', facility: 'OFFICE', shortSideM: 4, longSideM: 5 })],
  placements: { R1: Placement.ai('R1', { modelCode: 'RNW0401C2S', quantity: 3 }, POS(3)) },
  groups: [{ key: 'ODU1', label: '실외기-1', model: 'RPUW082X9E', items: ['R1'] }],
  indoorModels: [new IndoorModel({ model: 'RNW0401C2S', coolW: 4000, heatW: 4500, type: '4WAY 카세트', energySource: 'EHP' })],
  outdoorSpecs: [{ model: 'RPUW082X9E', coolKw: 23.3, heatKw: 25.9, hp: 8 }],
})
const snapshot = {
  type: 'table' as const,
  table,
  groupOptions: [{ key: 'ODU1', label: '실외기-1' }],
  indoorModelOptions: [{ code: 'RNW0401C2S' }, { code: 'RNW0201C2S' }],
}

beforeEach(() => {
  FakeBroadcastChannel.reset()
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
})
afterEach(() => vi.unstubAllGlobals())

describe('SelectionReviewWindow', () => {
  it('연결 전에는 대기 안내를 보여주고, 접속 시 hello를 보낸다', () => {
    const main = new FakeBroadcastChannel(SELECTION_CHANNEL)
    const got: unknown[] = []
    main.onmessage = (e) => got.push(e.data)
    render(<SelectionReviewWindow />)
    expect(screen.getByText(/연결을 기다리는 중/)).toBeInTheDocument()
    expect(got).toContainEqual({ type: 'hello' })
    main.close()
  })

  it('스냅샷을 수신하면 그리드를 렌더하고, 셀 편집은 edit 커맨드로 송신한다', () => {
    const main = new FakeBroadcastChannel(SELECTION_CHANNEL)
    const edits: SelectionEditMsg[] = []
    main.onmessage = (e) => { const d = e.data as SelectionEditMsg; if (d?.type === 'edit') edits.push(d) }

    render(<SelectionReviewWindow />)
    act(() => main.postMessage(snapshot))
    expect(screen.getByText('장비선정표 — 실시간 연동(메인 창 상태 기준)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('시청각실')).toBeInTheDocument()

    const nameInput = screen.getByDisplayValue('시청각실')
    fireEvent.change(nameInput, { target: { value: '멀티미디어실' } })
    fireEvent.blur(nameInput)
    expect(edits).toContainEqual({ type: 'edit', op: 'rename', roomId: 'R1', name: '멀티미디어실' })
    main.close()
  })
})

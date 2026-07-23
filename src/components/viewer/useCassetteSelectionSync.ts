// 에어컨(cassette) 모드 선택 양방향 동기 — 실내기 심볼 선택(selUnits) ↔ 실 선택(selectedIds).
//
// 실내기 심볼은 App(Placement)이, 실 선택은 패널이 소유한다. 두 선택이 어긋나면 도면과 패널이
// 다른 실을 가리킨다 → 양방향으로 맞춘다. 핑퐁 루프를 막는 게 핵심이라 두 개의 조정 ref를 둔다.
//  · firstSel      : 마운트 첫 실행은 초기 선택을 보존(발신하지 않는다)
//  · selFromSymbols : 순방향(심볼→실)이 발신한 selectedIds 변경이면 역방향을 1회 건너뛴다
//                     (없으면 자유 심볼 클릭 → 실 선택 → 그 실의 다른 대수 심볼까지 오선택)
import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { roomIdsForUnits } from './geometry'
import type { UnitSym, ZoneBox } from './geometry'
import type { Mode } from './props'

export interface CassetteSelectionSyncInput {
  mode: Mode
  symbols: UnitSym[]
  zones: ZoneBox[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export interface CassetteSelectionSync {
  selUnits: Set<string>
  setSelUnits: Dispatch<SetStateAction<Set<string>>>
}

export function useCassetteSelectionSync(input: CassetteSelectionSyncInput): CassetteSelectionSync {
  const { mode, symbols, zones, selectedIds, onSelectionChange } = input
  const [selUnits, setSelUnits] = useState<Set<string>>(() => new Set())
  const firstSel = useRef(true)
  const selFromSymbols = useRef(false)
  // 순방향 효과가 최신 selectedIds를 읽되 의존성엔 넣지 않도록 ref 스냅샷(핑퐁 방지).
  // 렌더 중이 아니라 이펙트에서 갱신한다(선언 순서상 아래 순방향 효과보다 먼저 실행 → 최신값을 본다).
  const selectedIdsRef = useRef(selectedIds)
  useEffect(() => { selectedIdsRef.current = selectedIds })

  // 순방향(심볼→실): 선택된 실내기 심볼 → 담당 실을 패널 선택으로 반영.
  // 마운트 시 초기 선택 보존, 방 밖 심볼 무시, 같은 실 다중 심볼 합침.
  useEffect(() => {
    if (firstSel.current) { firstSel.current = false; return }
    if (mode !== 'cassette') return
    const chosen = symbols.filter((s) => selUnits.has(s.id))
    const next = roomIdsForUnits(chosen, zones)
    const cur = selectedIdsRef.current
    // 이미 동일하면 재호출 금지(역방향 동기화와의 핑퐁 루프 차단).
    if (next.length !== cur.length || !next.every((id) => cur.includes(id))) {
      selFromSymbols.current = true
      onSelectionChange(next)
    }
    // symbols·zones도 의존: 드래그로 심볼이 다른 실로 옮겨지면 하이라이팅이 따라간다.
    // mode는 제외 — 모드 전환만으로 존 모드에서 만든 실 선택을 지우지 않기 위함.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selUnits, symbols, zones, onSelectionChange])

  // 역방향(실→심볼): 패널 등에서 실 선택이 바뀌면 그 실의 실내기 심볼 선택도 맞춘다.
  //  · 이미 일치하면 prev를 그대로 반환해 setState/루프를 막는다
  //  · 순방향이 발신한 변경이면 스킵 — 클릭한 심볼만 유지(같은 실 다른 대수 오선택 방지)
  useEffect(() => {
    if (selFromSymbols.current) { selFromSymbols.current = false; return }
    setSelUnits((prev) => {
      const desired = new Set<string>()
      for (const s of symbols) if (s.roomId && selectedIds.includes(s.roomId)) desired.add(s.id)
      const same = prev.size === desired.size && [...prev].every((x) => desired.has(x))
      return same ? prev : desired
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds])

  return { selUnits, setSelUnits }
}

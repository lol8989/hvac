// 장비선정표(SelectionTable) 순수 빌더 (Generation 컨텍스트 · 도메인 서비스).
// 행=실, 층 섹션+소계, 실외기 조합비 판정, BOM 집계 — 최종 산출물 도메인 모델.
// 불변(freeze) 결과 반환. Clean Architecture: 프레임워크에 의존하지 않는 순수 함수.
// 계약 타입은 SelectionTable.types.ts 참조(여기서 재수출).

import { ComboRange } from '../shared/ComboRange'
import type { Room } from './Room'
import type { Placement } from './Placement'
import type { IndoorModel } from './IndoorModel'
import type {
  ComboJudgement,
  SelectionGroupInput,
  SelectionRow,
  SelectionSubtotal,
  SelectionTable,
  SelectionTableInput,
} from './SelectionTable.types'

export type {
  ComboJudgement,
  FloorSection,
  GroupSection,
  OutdoorSpecLite,
  SelectionBom,
  SelectionGroupInput,
  SelectionRow,
  SelectionTable,
  SelectionTableInput,
} from './SelectionTable.types'

// 조합비 판정 — 선정표와 실외기 조합 매핑 팝업이 같은 규칙을 쓰도록 공개한다.
// 임계는 제품군별 ComboRange(정책값)이며, 하드코딩 0.5~1.3에 의존하지 않는다.
export const judgeCombo = (ratio: number, range: ComboRange): ComboJudgement => {
  if (ratio < range.min) return 'UNDERLOADED'
  if (ratio > range.max) return 'OVERLOADED'
  return 'OK'
}

// ── 내부 헬퍼 ────────────────────────────────────────────────

const judge = judgeCombo

// 실 1개 → 기본 행 (실외기 정보는 이후 그룹 첫 행에 부착)
const buildBaseRow = (
  room: Room,
  placement: Placement | undefined,
  catalog: ReadonlyMap<string, IndoorModel>,
  groupOf: ReadonlyMap<string, SelectionGroupInput>,
): SelectionRow => {
  let indoor: SelectionRow['indoor'] = null
  if (placement) {
    const sel = placement.effectiveSelection
    const model = catalog.get(sel.modelCode)
    if (!model) throw new Error(`실내기 카탈로그에 없는 모델 코드입니다: ${sel.modelCode}`)
    indoor = {
      code: model.code,
      model: model.model,
      type: model.type,
      coolW: model.coolW,
      heatW: model.heatW,
      quantity: sel.quantity,
      totalCoolW: model.totalCoolW(sel.quantity),
      totalHeatW: model.totalHeatW(sel.quantity),
      overridden: placement.isOverridden,
    }
  }
  const u = room.effectiveUnitLoad
  const g = groupOf.get(room.id)
  return {
    roomId: room.id,
    floor: room.floor,
    roomName: room.name,
    areaM2: room.areaM2,
    unitLoad: {
      coolKcal: u.coolKcal,
      heatKcal: u.heatKcal,
      coolW: u.coolW,
      heatW: u.heatW,
      overridden: room.isUnitLoadOverridden,
    },
    requiredW: room.requiredLoadW,
    indoor,
    group: g ? { key: g.key, label: g.label } : null,
    outdoor: null,
  }
}

// ── 빌더 본체 ────────────────────────────────────────────────

export const buildSelectionTable = (input: SelectionTableInput): SelectionTable => {
  const catalog = new Map(input.indoorModels.map((m) => [m.code, m] as const))
  const specByModel = new Map(input.outdoorSpecs.map((s) => [s.model, s] as const))
  const groupByKey = new Map(input.groups.map((g) => [g.key, g] as const))
  const groupOf = new Map<string, SelectionGroupInput>()
  for (const g of input.groups) for (const id of g.items) groupOf.set(id, g)

  // 1) 층 섹션화: floor 등장 순서, 섹션 내 rooms 입력 순서 유지
  const rowsByFloor = new Map<string, SelectionRow[]>()
  for (const room of input.rooms) {
    const row = buildBaseRow(room, input.placements[room.id], catalog, groupOf)
    const list = rowsByFloor.get(room.floor) ?? []
    if (list.length === 0) rowsByFloor.set(room.floor, list)
    list.push(row)
  }
  const tableOrder = [...rowsByFloor.values()].flat() // 표 순서(섹션 평탄화)

  // 2) 그룹별 실내기 총냉방W 집계 — 그룹 전체(모든 층) 기준
  const groupCoolW = new Map<string, number>()
  for (const row of tableOrder) {
    if (!row.group || !row.indoor) continue
    groupCoolW.set(row.group.key, (groupCoolW.get(row.group.key) ?? 0) + row.indoor.totalCoolW)
  }

  // 3) 표 순서상 그룹 첫 행에 실외기 부착 + BOM 실외기 집계 (배정 실 있는 그룹만)
  const outdoorAgg = new Map<string, { hp: number; model: string; quantity: number }>()
  const attached = new Set<string>()
  let hpTotal = 0
  for (const row of tableOrder) {
    if (!row.group || attached.has(row.group.key)) continue
    attached.add(row.group.key)
    const g = groupByKey.get(row.group.key)!
    const spec = specByModel.get(g.model)
    if (!spec) throw new Error(`실외기 스펙에 없는 모델입니다: ${g.model}`)
    const comboRatio = (groupCoolW.get(g.key) ?? 0) / (spec.coolKw * 1000)
    row.outdoor = Object.freeze({
      hp: spec.hp,
      model: spec.model,
      coolKw: spec.coolKw,
      heatKw: spec.heatKw,
      quantity: 1,
      comboRatio,
      judgement: judge(comboRatio, spec.comboRange ?? ComboRange.DEFAULT),
    })
    if (!outdoorAgg.has(spec.model)) outdoorAgg.set(spec.model, { hp: spec.hp, model: spec.model, quantity: 0 })
    outdoorAgg.get(spec.model)!.quantity += 1
    hpTotal += spec.hp
  }

  // 4) 층 섹션 > 실외기 그룹 소섹션 (주인님 지시 2026-07-10)
  //
  // Confluence 자동배치 룰: "한 실외기가 여러 층에 걸치지 않는다" → 그룹은 한 층 안에 있다.
  // 조합비는 행이 아니라 그룹에 붙는다. 미배정 실은 층의 unassigned로 모인다.
  const sumOf = (rows: readonly SelectionRow[]): SelectionSubtotal => {
    const t = { quantity: 0, totalCoolW: 0, totalHeatW: 0 }
    for (const r of rows) {
      if (!r.indoor) continue
      t.quantity += r.indoor.quantity
      t.totalCoolW += r.indoor.totalCoolW
      t.totalHeatW += r.indoor.totalHeatW
    }
    return t
  }

  const floors = [...rowsByFloor.entries()].map(([floor, rows]) => {
    const frozen = rows.map((r) => Object.freeze(r))

    // 그룹 등장 순서(표 순서)를 유지한다.
    const byGroup = new Map<string, SelectionRow[]>()
    const unassigned: SelectionRow[] = []
    for (const r of frozen) {
      if (!r.group) { unassigned.push(r); continue }
      const list = byGroup.get(r.group.key) ?? []
      if (!list.length) byGroup.set(r.group.key, list)
      list.push(r)
    }

    const groups = [...byGroup.entries()].map(([key, groupRows]) => {
      const g = groupByKey.get(key)!
      const spec = specByModel.get(g.model)!
      const comboRatio = (groupCoolW.get(key) ?? 0) / (spec.coolKw * 1000)
      return Object.freeze({
        key,
        label: g.label,
        rows: Object.freeze(groupRows),
        subtotal: Object.freeze(sumOf(groupRows)),
        outdoor: Object.freeze({
          hp: spec.hp,
          model: spec.model,
          coolKw: spec.coolKw,
          heatKw: spec.heatKw,
          quantity: 1,
          comboRatio,
          judgement: judge(comboRatio, spec.comboRange ?? ComboRange.DEFAULT),
        }),
      })
    })

    return Object.freeze({
      floor,
      rows: Object.freeze(frozen),
      groups: Object.freeze(groups),
      unassigned: Object.freeze(unassigned),
      subtotal: Object.freeze(sumOf(frozen)),
    })
  })

  // 5) BOM 실내기: code별 quantity 합산(표 등장 순서)
  const indoorAgg = new Map<string, { code: string; model: string; quantity: number }>()
  for (const row of tableOrder) {
    if (!row.indoor) continue
    if (!indoorAgg.has(row.indoor.code)) {
      indoorAgg.set(row.indoor.code, { code: row.indoor.code, model: row.indoor.model, quantity: 0 })
    }
    indoorAgg.get(row.indoor.code)!.quantity += row.indoor.quantity
  }
  const indoor = [...indoorAgg.values()].map((v) => Object.freeze(v))
  const outdoor = [...outdoorAgg.values()].map((v) => Object.freeze(v))
  const bom = Object.freeze({
    indoor: Object.freeze(indoor),
    outdoor: Object.freeze(outdoor),
    indoorTotal: indoor.reduce((s, v) => s + v.quantity, 0),
    outdoorTotal: outdoor.reduce((s, v) => s + v.quantity, 0),
    hpTotal,
  })
  return Object.freeze({ floors: Object.freeze(floors), bom })
}

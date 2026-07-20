// 실별 실내기 배치 (Generation 컨텍스트 · Value Object).
// AI 기본 선정 + 사용자 오버라이드(Adjustable) — AI 재선정 시 수정 셀(user) 보존.
// 불변 + 자기검증. Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.
//
// 좌표(positions)를 애그리거트 안에 둔다. 도면에 놓인 심볼 하나가 실내기 한 대이므로
// 불변식은 `positions.length === effectiveSelection.quantity`다. 이 불변식이 있어야
// "도면에서 실내기를 지웠는데 선정표 대수는 그대로"인 상태가 표현 불가능해진다.

import type { Adjustable } from '../shared/Adjustable'
import {
  adjustable,
  effective,
  isOverridden,
  withUser,
  clearUser,
  withAi,
} from '../shared/Adjustable'
import type { IndoorModel, IndoorSelection } from './IndoorModel'
import type { UnitPosition } from './layoutPositions'

function requireNonBlank(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name}은(는) 빈값일 수 없습니다`)
  }
  return value
}

// 선정값 검증 + 동결 사본 반환 — 모든 selection 설정 경로에서 통과해야 한다.
function validSelection(sel: IndoorSelection): IndoorSelection {
  requireNonBlank(sel.modelCode, 'modelCode')
  if (!Number.isInteger(sel.quantity) || sel.quantity < 1) {
    throw new Error('quantity는 1 이상의 정수여야 합니다')
  }
  return Object.freeze({ modelCode: sel.modelCode, quantity: sel.quantity })
}

function validPosition(p: UnitPosition): UnitPosition {
  for (const k of ['x', 'y', 'rot'] as const) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) {
      throw new Error(`좌표 ${k}는 유한수여야 합니다`)
    }
  }
  return Object.freeze({ x: p.x, y: p.y, rot: p.rot })
}

// 좌표 개수가 대수와 같아야 한다 — 이 클래스의 존재 이유.
function validPositions(positions: readonly UnitPosition[], quantity: number): readonly UnitPosition[] {
  if (!Array.isArray(positions) || positions.length !== quantity) {
    throw new Error(`좌표 개수(${positions?.length})가 대수(${quantity})와 다릅니다`)
  }
  return Object.freeze(positions.map(validPosition))
}

export class Placement {
  readonly roomId: string
  readonly selection: Adjustable<IndoorSelection>
  readonly positions: readonly UnitPosition[]

  private constructor(roomId: string, selection: Adjustable<IndoorSelection>, positions: readonly UnitPosition[]) {
    this.roomId = requireNonBlank(roomId, 'roomId')
    this.selection = selection
    this.positions = validPositions(positions, effective(selection).quantity)
    Object.freeze(this)
  }

  // AI 최초 선정으로 생성. positions는 대수만큼(layoutPositions 결과).
  static ai(roomId: string, sel: IndoorSelection, positions: readonly UnitPosition[]): Placement {
    const valid = validSelection(sel)
    return new Placement(roomId, adjustable(valid), positions)
  }

  // 유효 선정값: 사용자 오버라이드가 있으면 user, 없으면 ai
  get effectiveSelection(): IndoorSelection {
    return effective(this.selection)
  }

  get isOverridden(): boolean {
    return isOverridden(this.selection)
  }

  // 설치 대수 = 도면에 놓인 심볼 수
  get quantity(): number {
    return this.positions.length
  }

  // AI 재선정 — 사용자 오버라이드(수정 셀)는 보존한다.
  // 좌표도 지킨다: 오버라이드가 있거나 **대수가 그대로면** 사용자가 도면에서 놓은 자리를 유지한다.
  // (적대적 QA 2026-07-14: 실명 하나를 고쳤을 뿐인데 무관한 실의 실내기가 격자 중심으로
  //  되돌아갔다. 좌표는 '실외기 배치' 단계에서 산출물에 실리는 값이다 — 함부로 재배치하지 않는다.)
  withAiSelection(sel: IndoorSelection, aiPositions: readonly UnitPosition[]): Placement {
    const valid = validSelection(sel)
    const next = withAi(this.selection, valid)
    const keep = this.isOverridden || effective(next).quantity === this.positions.length
    return new Placement(this.roomId, next, keep ? this.positions : aiPositions)
  }

  // 사용자 조정 (오버라이드 설정). 대수가 바뀌면 좌표도 함께 준다.
  overrideSelection(sel: IndoorSelection, positions: readonly UnitPosition[]): Placement {
    const valid = validSelection(sel)
    return new Placement(this.roomId, withUser(this.selection, valid), positions)
  }

  // 오버라이드 해제 — 최신 AI값으로 복귀. 좌표는 AI 대수에 맞춘 것을 준다.
  clearOverride(aiPositions: readonly UnitPosition[]): Placement {
    return new Placement(this.roomId, clearUser(this.selection), aiPositions)
  }

  // ── 도면 편집(좌표만 바뀜, 대수 불변) ──
  moveUnit(index: number, x: number, y: number): Placement {
    return this._withPositions(this._mapAt(index, (p) => ({ ...p, x, y })))
  }

  rotateUnit(index: number, rot: number): Placement {
    return this._withPositions(this._mapAt(index, (p) => ({ ...p, rot })))
  }

  // ── 도면 편집(대수가 바뀜 → 사용자 오버라이드로 기록) ──

  // 심볼 추가 → 대수 +1. 모델은 유지(한 실은 동일 용량 — 실내기_자동배치_룰 §4).
  addUnit(pos: UnitPosition): Placement {
    const sel = this.effectiveSelection
    const positions = [...this.positions, pos]
    return this.overrideSelection({ modelCode: sel.modelCode, quantity: positions.length }, positions)
  }

  // 심볼 삭제 → 대수 −1. 마지막 한 대를 지우면 그 실에는 실내기가 없다 → null.
  // (quantity ≥ 1 불변식 때문에 '0대인 Placement'는 존재할 수 없다.)
  removeUnit(index: number): Placement | null {
    this._requireIndex(index)
    const positions = this.positions.filter((_, i) => i !== index)
    if (positions.length === 0) return null
    const sel = this.effectiveSelection
    return this.overrideSelection({ modelCode: sel.modelCode, quantity: positions.length }, positions)
  }

  // 유효 선정 기준 총 냉/난방용량(W). 모델 코드 불일치 시 throw(정합 보호).
  totals(model: IndoorModel): { coolW: number; heatW: number } {
    const sel = this.effectiveSelection
    if (model.model !== sel.modelCode) {
      throw new Error(
        `모델 코드 불일치: 선정 '${sel.modelCode}' ≠ 전달 모델 '${model.model}'`,
      )
    }
    return {
      coolW: model.totalCoolW(sel.quantity),
      heatW: model.totalHeatW(sel.quantity),
    }
  }

  // 동등성은 roomId 기준 (실 1곳 = 배치 1건)
  equals(o: Placement): boolean {
    return o instanceof Placement && o.roomId === this.roomId
  }

  private _requireIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.positions.length) {
      throw new Error(`실내기 index ${index}가 범위를 벗어났습니다 (0~${this.positions.length - 1})`)
    }
  }

  private _mapAt(index: number, fn: (p: UnitPosition) => UnitPosition): UnitPosition[] {
    this._requireIndex(index)
    return this.positions.map((p, i) => (i === index ? fn(p) : p))
  }

  private _withPositions(positions: readonly UnitPosition[]): Placement {
    return new Placement(this.roomId, this.selection, positions)
  }
}

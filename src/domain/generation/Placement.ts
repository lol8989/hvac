// 실별 실내기 배치 (Generation 컨텍스트 · Value Object).
// AI 기본 선정 + 사용자 오버라이드(Adjustable) — AI 재선정 시 수정 셀(user) 보존.
// 불변 + 자기검증. Clean Architecture: 프레임워크(React/DB)에 의존하지 않는 순수 도메인.

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

export class Placement {
  readonly roomId: string
  readonly selection: Adjustable<IndoorSelection>

  private constructor(roomId: string, selection: Adjustable<IndoorSelection>) {
    this.roomId = requireNonBlank(roomId, 'roomId')
    this.selection = selection
    Object.freeze(this)
  }

  // AI 최초 선정으로 생성
  static ai(roomId: string, sel: IndoorSelection): Placement {
    return new Placement(roomId, adjustable(validSelection(sel)))
  }

  // 유효 선정값: 사용자 오버라이드가 있으면 user, 없으면 ai
  get effectiveSelection(): IndoorSelection {
    return effective(this.selection)
  }

  get isOverridden(): boolean {
    return isOverridden(this.selection)
  }

  // AI 재선정 — 사용자 오버라이드(수정 셀)는 보존한다
  withAiSelection(sel: IndoorSelection): Placement {
    return new Placement(this.roomId, withAi(this.selection, validSelection(sel)))
  }

  // 사용자 조정 (오버라이드 설정)
  overrideSelection(sel: IndoorSelection): Placement {
    return new Placement(this.roomId, withUser(this.selection, validSelection(sel)))
  }

  // 오버라이드 해제 — 최신 AI값으로 복귀
  clearOverride(): Placement {
    return new Placement(this.roomId, clearUser(this.selection))
  }

  // 유효 선정 기준 총 냉/난방용량(W). 모델 코드 불일치 시 throw(정합 보호).
  totals(model: IndoorModel): { coolW: number; heatW: number } {
    const sel = this.effectiveSelection
    if (model.code !== sel.modelCode) {
      throw new Error(
        `모델 코드 불일치: 선정 '${sel.modelCode}' ≠ 전달 모델 '${model.code}'`,
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
}

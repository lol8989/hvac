// 실외기 조합 애그리거트 루트 (Generation Context).
// 실외기 1대 + 연결된 실내기들의 묶음. 그룹 내부 불변식을 강제한다:
//   ① 계열 일치(교차 계열 배정 금지)  ② 최대 연결 수 초과 금지  ③ 실내기 중복 금지
// 조합비 범위(0.5~1.3)는 "경고"이지 배정 거부 사유가 아니다.
//
// 불변(immutable): 상태 변경 메서드는 원본을 바꾸지 않고 새 OutdoorGroup을 반환한다.
// 그룹 간 이동(다른 그룹/미배정 풀)은 여러 애그리거트에 걸친 트랜잭션이므로
// 애플리케이션 유즈케이스가 unassign/assign을 조율한다(도메인은 자기 불변식만 책임).

import { ComboRatio } from '../shared/ComboRatio.js'

export const ASSIGN_REASON = {
  SERIES_MISMATCH: 'SERIES_MISMATCH', // 계열 불일치
  DUPLICATE: 'DUPLICATE', // 이미 배정된 실내기
  MAX_CONNECTIONS: 'MAX_CONNECTIONS', // 최대 연결 수 초과
}

export class OutdoorGroup {
  constructor({ key, label, outdoorUnit, indoorUnits = [] }) {
    // 구조 불변식(생성 시점 강제): 계열 일치 + id 중복 금지.
    // maxConnections(최대 연결 수)는 "성장" 제약이므로 assign 시점에서만 검사한다.
    const seen = new Set()
    for (const idu of indoorUnits) {
      if (!outdoorUnit.energySource.equals(idu.energySource)) {
        throw new Error(`계열 불일치 실내기로 그룹을 구성할 수 없습니다: ${idu.id} (${idu.energySource.code})`)
      }
      if (seen.has(idu.id)) {
        throw new Error(`중복 실내기로 그룹을 구성할 수 없습니다: ${idu.id}`)
      }
      seen.add(idu.id)
    }
    this.key = key
    this.label = label
    this.outdoorUnit = outdoorUnit
    this._indoorUnits = [...indoorUnits]
  }

  // 방어적 복사본 — 외부에서 내부 배열을 변경할 수 없다.
  get indoorUnits() {
    return [...this._indoorUnits]
  }

  // 배정 가능 여부와 불가 사유를 반환한다(부작용 없음).
  canAssign(indoor) {
    if (!this.outdoorUnit.energySource.equals(indoor.energySource)) {
      return { ok: false, reason: ASSIGN_REASON.SERIES_MISMATCH }
    }
    if (this._indoorUnits.some((i) => i.id === indoor.id)) {
      return { ok: false, reason: ASSIGN_REASON.DUPLICATE }
    }
    if (this._indoorUnits.length >= this.outdoorUnit.maxConnections) {
      return { ok: false, reason: ASSIGN_REASON.MAX_CONNECTIONS }
    }
    return { ok: true }
  }

  // 실내기 배정. 불변식 위반 시 예외. 성공 시 새 그룹 반환.
  assign(indoor) {
    const check = this.canAssign(indoor)
    if (!check.ok) {
      throw new Error(`실내기 ${indoor.id} 배정 불가: ${check.reason}`)
    }
    return this._with([...this._indoorUnits, indoor])
  }

  // 실내기 해제(id). 없는 id는 무해.
  unassign(id) {
    return this._with(this._indoorUnits.filter((i) => i.id !== id))
  }

  // 조합비 = Σ(연결 실내기 냉방용량) / 실외기 용량.
  comboRatio() {
    const total = this._indoorUnits.reduce((sum, i) => sum + i.cool.kw, 0)
    return new ComboRatio(total, this.outdoorUnit.capacity.kw)
  }

  // 조합비 기반 경고 코드 목록(배정을 막지는 않는다).
  warnings() {
    const r = this.comboRatio()
    const w = []
    if (r.isOverloaded) w.push('OVERLOADED')
    if (r.isUnderloaded) w.push('UNDERLOADED')
    return w
  }

  // 실외기 모델 교체. 계열이 바뀌어 호환 안 되는 실내기는 방출 목록으로 돌려준다.
  replaceModel(newOutdoorUnit) {
    const kept = []
    const ejected = []
    for (const idu of this._indoorUnits) {
      if (newOutdoorUnit.energySource.equals(idu.energySource)) kept.push(idu)
      else ejected.push(idu)
    }
    const group = new OutdoorGroup({ key: this.key, label: this.label, outdoorUnit: newOutdoorUnit, indoorUnits: kept })
    return { group, ejected }
  }

  // 그룹 분할: 실내기 절반을 같은 실외기 모델의 새 그룹으로 옮긴다.
  split(nextMeta) {
    if (this._indoorUnits.length < 2) {
      throw new Error('실내기가 2개 미만이면 분할할 수 없습니다')
    }
    const half = Math.ceil(this._indoorUnits.length / 2)
    const kept = this._indoorUnits.slice(0, half)
    const moved = this._indoorUnits.slice(half)
    const group = this._with(kept)
    const newGroup = new OutdoorGroup({
      key: nextMeta.key,
      label: nextMeta.label,
      outdoorUnit: this.outdoorUnit,
      indoorUnits: moved,
    })
    return { group, newGroup }
  }

  // 내부: 실내기 목록만 교체한 새 그룹 생성(메타·실외기 유지).
  _with(indoorUnits) {
    return new OutdoorGroup({ key: this.key, label: this.label, outdoorUnit: this.outdoorUnit, indoorUnits })
  }
}

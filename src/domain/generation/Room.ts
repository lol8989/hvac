// Room 엔티티 (Generation 컨텍스트).
// 층·실명·면적·용도·단위부하를 갖는 실(방) 단위. 불변 + 자기검증.
// 단위부하는 Adjustable<UnitLoad> — AI 기본값 + 사용자 오버라이드(수정 셀 보존 정책).

import {
  Adjustable,
  adjustable,
  effective,
  isOverridden,
  withUser,
  clearUser,
  withAi,
} from '../shared/Adjustable'
import { UnitLoad, unitLoadForUsage } from '../shared/UnitLoad'

const assertNonEmpty = (v: string, name: string): void => {
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`${name}은(는) 빈 값일 수 없습니다`)
  }
}

const assertPositiveFinite = (v: number, name: string): void => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`${name}은(는) 0보다 큰 유한수여야 합니다`)
  }
}

export class Room {
  private constructor(
    readonly id: string,
    readonly floor: string,
    readonly name: string,
    readonly areaM2: number,
    readonly usage: string,
    readonly unitLoad: Adjustable<UnitLoad>,
  ) {
    assertNonEmpty(id, 'id')
    assertNonEmpty(floor, 'floor')
    assertNonEmpty(name, 'name(실명)')
    assertPositiveFinite(areaM2, 'areaM2')
    Object.freeze(this)
  }

  // aiUnitLoad 생략 시 용도(usage) 기반 기본 단위부하를 AI 값으로 시딩
  static create(props: {
    id: string
    floor: string
    name: string
    areaM2: number
    usage: string
    aiUnitLoad?: UnitLoad
  }): Room {
    const ai = props.aiUnitLoad ?? unitLoadForUsage(props.usage)
    return new Room(props.id, props.floor, props.name, props.areaM2, props.usage, adjustable(ai))
  }

  get effectiveUnitLoad(): UnitLoad {
    return effective(this.unitLoad)
  }

  get isUnitLoadOverridden(): boolean {
    return isOverridden(this.unitLoad)
  }

  // 필요부하량(W) = 유효 단위부하 × 면적
  get requiredLoadW(): { cool: number; heat: number } {
    return this.effectiveUnitLoad.requiredLoadW(this.areaM2)
  }

  rename(name: string): Room {
    return new Room(this.id, this.floor, name, this.areaM2, this.usage, this.unitLoad)
  }

  withArea(areaM2: number): Room {
    return new Room(this.id, this.floor, this.name, areaM2, this.usage, this.unitLoad)
  }

  // 용도 변경 → AI 단위부하를 새 용도 기본값으로 갱신, user 오버라이드는 보존(withAi)
  withUsage(usage: string): Room {
    const next = withAi(this.unitLoad, unitLoadForUsage(usage))
    return new Room(this.id, this.floor, this.name, this.areaM2, usage, next)
  }

  overrideUnitLoad(u: UnitLoad): Room {
    return new Room(this.id, this.floor, this.name, this.areaM2, this.usage, withUser(this.unitLoad, u))
  }

  clearUnitLoadOverride(): Room {
    return new Room(this.id, this.floor, this.name, this.areaM2, this.usage, clearUser(this.unitLoad))
  }

  // 엔티티 동일성: id 기준
  equals(o: Room): boolean {
    return o instanceof Room && o.id === this.id
  }
}

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
import type { FacilityType, LoadIntensity } from '../shared/unitLoadTable'
import type { RoomShape } from './placementRules'

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

// 단위세대는 시설군에서, 복도는 용도에서 파생한다 — 별도 플래그를 두면 두 진실이 어긋난다.
const isResidential = (facility: FacilityType): boolean => facility === '주거시설'
const isCorridor = (usage: string): boolean => usage.includes('복도')

export class Room {
  private constructor(
    readonly id: string,
    readonly floor: string,
    readonly name: string,
    readonly areaM2: number,
    readonly usage: string,
    // 실측 변 길이(m). 타입 결정(짧은 폭 경계)과 확산범위 대수 계산이 요구한다.
    readonly shortSideM: number,
    readonly longSideM: number,
    // 시설군·부하강도가 있어야 단위부하가 정해진다 — 같은 실명도 시설군마다 값이 다르다
    // (식당: 주거 120 / 상업 210). 근거: doc/03_데이터/LG전자_단위부하_참고자료.pdf
    readonly facility: FacilityType,
    readonly intensity: LoadIntensity,
    readonly unitLoad: Adjustable<UnitLoad>,
  ) {
    assertNonEmpty(id, 'id')
    assertNonEmpty(floor, 'floor')
    assertNonEmpty(name, 'name(실명)')
    assertPositiveFinite(areaM2, 'areaM2')
    assertPositiveFinite(shortSideM, 'shortSideM')
    assertPositiveFinite(longSideM, 'longSideM')
    Object.freeze(this)
  }

  // aiUnitLoad 생략 시 용도(usage) 기반 기본 단위부하를 AI 값으로 시딩
  static create(props: {
    id: string
    floor: string
    name: string
    areaM2: number
    usage: string
    facility: FacilityType
    shortSideM: number
    longSideM: number
    intensity?: LoadIntensity
    aiUnitLoad?: UnitLoad
  }): Room {
    const intensity = props.intensity ?? 'STANDARD'
    const ai = props.aiUnitLoad ?? unitLoadForUsage(props.facility, props.usage, intensity)
    // 호출자가 뒤집어 줘도 정규화한다 — 짧은 변이 규칙의 기준이다.
    const short = Math.min(props.shortSideM, props.longSideM)
    const long = Math.max(props.shortSideM, props.longSideM)
    return new Room(props.id, props.floor, props.name, props.areaM2, props.usage, short, long, props.facility, intensity, adjustable(ai))
  }

  // 실내기 타입 결정에 쓰이는 형상. 필요부하는 호출부에서 합친다(requiredLoadW.cool).
  get shape(): Omit<RoomShape, 'requiredCoolW'> {
    return {
      shortSideM: this.shortSideM,
      longSideM: this.longSideM,
      residential: isResidential(this.facility),
      corridor: isCorridor(this.usage),
    }
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
    return new Room(this.id, this.floor, name, this.areaM2, this.usage, this.shortSideM, this.longSideM, this.facility, this.intensity, this.unitLoad)
  }

  withArea(areaM2: number): Room {
    return new Room(this.id, this.floor, this.name, areaM2, this.usage, this.shortSideM, this.longSideM, this.facility, this.intensity, this.unitLoad)
  }

  // 용도 변경 → AI 단위부하를 새 용도 기본값으로 갱신, user 오버라이드는 보존(withAi)
  withUsage(usage: string): Room {
    const next = withAi(this.unitLoad, unitLoadForUsage(this.facility, usage, this.intensity))
    return new Room(this.id, this.floor, this.name, this.areaM2, usage, this.shortSideM, this.longSideM, this.facility, this.intensity, next)
  }

  // 부하강도 변경(지하층=저부하, 외기 2면 이상=고부하, 천정고 4m 이상=특수부하)
  withIntensity(intensity: LoadIntensity): Room {
    const next = withAi(this.unitLoad, unitLoadForUsage(this.facility, this.usage, intensity))
    return new Room(this.id, this.floor, this.name, this.areaM2, this.usage, this.shortSideM, this.longSideM, this.facility, intensity, next)
  }

  overrideUnitLoad(u: UnitLoad): Room {
    return new Room(this.id, this.floor, this.name, this.areaM2, this.usage, this.shortSideM, this.longSideM, this.facility, this.intensity, withUser(this.unitLoad, u))
  }

  clearUnitLoadOverride(): Room {
    return new Room(this.id, this.floor, this.name, this.areaM2, this.usage, this.shortSideM, this.longSideM, this.facility, this.intensity, clearUser(this.unitLoad))
  }

  // 엔티티 동일성: id 기준
  equals(o: Room): boolean {
    return o instanceof Room && o.id === this.id
  }
}

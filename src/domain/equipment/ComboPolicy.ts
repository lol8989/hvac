// 조합비 정책 — 순수 도메인. 전역 기본 + 실외기 모델별 override.
//
// 우선순위: 모델별 override > 전역 기본 (주인님 확정 2026-07-10).
// 전역 기본 50~103%는 Confluence「자동배치 룰」의 "목표 100%, 허용 50%~103%"를 따른다.
// 값 자체는 코드 상수가 아니라 관리 UI에서 설정한다 — 여기 있는 건 '해석 규칙'뿐이다.

import { ComboRange } from '../shared/ComboRange'

// 모델명 비교 키. 대소문자·앞뒤 공백에 흔들리지 않는다.
const key = (modelCode: string): string => modelCode.trim().toUpperCase()

export class ComboPolicy {
  private readonly overrides: ReadonlyMap<string, ComboRange>

  constructor(
    readonly global: ComboRange,
    overrides: ReadonlyMap<string, ComboRange> = new Map(),
  ) {
    // 방어적 복사 — 넘겨받은 Map을 외부에서 흔들어도 정책은 변하지 않는다.
    this.overrides = new Map([...overrides].map(([m, r]) => [key(m), r]))
    Object.freeze(this)
  }

  rangeFor(modelCode: string): ComboRange {
    return this.overrides.get(key(modelCode)) ?? this.global
  }

  // 이 모델에 override가 걸려 있는가(UI에서 '기본값 사용' 여부 표시용).
  hasOverride(modelCode: string): boolean {
    return this.overrides.has(key(modelCode))
  }

  overrideEntries(): ReadonlyArray<[string, ComboRange]> {
    return [...this.overrides]
  }

  // range가 null이면 override를 걷어내고 전역 기본으로 되돌린다.
  with(modelCode: string, range: ComboRange | null): ComboPolicy {
    const next = new Map(this.overrides)
    if (range === null) next.delete(key(modelCode))
    else next.set(key(modelCode), range)
    return new ComboPolicy(this.global, next)
  }

  withGlobal(range: ComboRange): ComboPolicy {
    return new ComboPolicy(range, this.overrides)
  }
}

// 장비마스터 도메인 예외 — 불변식 위반을 타입으로 구분해 상위 레이어(UI)가 분기할 수 있게 한다.
// 순수 도메인 — 프레임워크 무지.

export type EquipmentErrorCode =
  | 'INVALID_TRANSITION' // 허용되지 않은 게시 상태 전이
  | 'SPEC_LOCKED' // 게시·보관본 스펙 수정 시도
  | 'DUPLICATE_MODEL_CODE' // 모델명(model_code) 중복
  | 'NOT_FOUND' // 대상 제품 없음
  | 'INVALID_FIELD' // 필드 유효성 위반(음수 용량 등)

export class EquipmentDomainError extends Error {
  constructor(
    readonly code: EquipmentErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'EquipmentDomainError'
  }
}

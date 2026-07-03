// Generation 컨텍스트 도메인 에러. 애플리케이션/프리젠테이션이 사유별로 분기할 수 있도록
// 타입과 코드를 구분한다. (프로그래밍 오류가 아니라 도메인 규칙 위반을 표현)

export class DomainError extends Error {}

// 실내기 배정이 불변식(계열/최대수/중복)에 의해 거부됨.
export class AssignmentRejected extends DomainError {
  constructor(indoorId, reason) {
    super(`실내기 ${indoorId} 배정 불가: ${reason}`)
    this.name = 'AssignmentRejected'
    this.indoorId = indoorId
    this.reason = reason // 'SERIES_MISMATCH' | 'DUPLICATE' | 'MAX_CONNECTIONS'
  }
}

// 존재하지 않는 실내기/그룹 참조.
export class NotFoundError extends DomainError {
  constructor(message) {
    super(message)
    this.name = 'NotFoundError'
  }
}

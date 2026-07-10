// Generation 컨텍스트 도메인 에러. 애플리케이션/프리젠테이션이 사유별로 분기할 수 있도록
// 타입과 코드를 구분한다. (프로그래밍 오류가 아니라 도메인 규칙 위반을 표현)

export type AssignReason = 'SERIES_MISMATCH' | 'DUPLICATE' | 'MAX_CONNECTIONS'

export class DomainError extends Error {}

// 실내기 배정이 불변식(계열/최대수/중복)에 의해 거부됨.
export class AssignmentRejected extends DomainError {
  readonly indoorId: string
  readonly reason: AssignReason

  constructor(indoorId: string, reason: AssignReason) {
    super(`실내기 ${indoorId} 배정 불가: ${reason}`)
    this.name = 'AssignmentRejected'
    this.indoorId = indoorId
    this.reason = reason
  }
}

// 존재하지 않는 실내기/그룹 참조.
export class NotFoundError extends DomainError {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

// 실외기 선정: 그 계열에 쓸 수 있는 실외기가 카탈로그(게시본)에 없다.
export class NoCompatibleOutdoorError extends DomainError {
  readonly energySource: string

  constructor(energySource: string) {
    super(`${energySource} 계열에 연결할 수 있는 게시된 실외기가 없습니다`)
    this.name = 'NoCompatibleOutdoorError'
    this.energySource = energySource
  }
}

// 실외기 선정: 한 실의 실내기를 어떤 실외기 조합으로도 감당할 수 없다.
// (실 하나의 정격 합이 최대 실외기 용량×허용 상한을 넘거나, 대수가 최대 연결 대수를 넘는다)
export class UnpackableLoadError extends DomainError {
  readonly roomId: string

  constructor(roomId: string, message: string) {
    super(message)
    this.name = 'UnpackableLoadError'
    this.roomId = roomId
  }
}

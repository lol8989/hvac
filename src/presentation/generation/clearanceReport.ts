// 실외기 이격거리 검사 결과(표현 계층 조립 — 순수).
//
// 이격은 실치수(mm) 규칙인데 도면 좌표는 정규화 단위다. 축척(mmPerUnit)을 알아야 잴 수 있고,
// 목업 좌표계처럼 축척을 모르면 **잴 수 없다**.
//
// 그때 "위반 0건"으로 보고하면 가드가 통과시킨다 — **검사하지 않은 것을 합격으로 읽는
// false-green**이다(적대적 QA). 그래서 `checked`로 "검사했는가"와 "위반이 있는가"를 가른다.
// 판정 규칙 자체는 도메인(clearanceRules)이 갖고, 여기는 좌표 환산·대상 추리기만 한다.
import { checkClearances } from '../../domain/generation/clearanceRules'

export interface ClearanceReportInput {
  groups: readonly { key: string; label: string }[]
  positions: Readonly<Record<string, { x: number; y: number }>>
  mmPerUnit?: number // 정규화 1단위 = 실 mm. 없으면 축척 불명
}

export interface ClearanceReport {
  checked: boolean // 축척을 알아 실제로 검사했는가
  violations: string[] // 위반 설명(검사하지 않았으면 빈 배열)
}

export const buildClearanceReport = (input: ClearanceReportInput): ClearanceReport => {
  const { groups, positions, mmPerUnit } = input
  if (!mmPerUnit) return { checked: false, violations: [] }
  const placed = groups
    .filter((g) => positions[g.key])
    .map((g) => ({ key: g.key, label: g.label, x: positions[g.key].x * mmPerUnit, y: positions[g.key].y * mmPerUnit }))
  return { checked: true, violations: checkClearances(placed).map((v) => v.message) }
}

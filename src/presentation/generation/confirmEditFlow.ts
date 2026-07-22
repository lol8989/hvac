// 편집 확정 흐름 결정(순수) — 세 단계(place·combine·outdoor)의 가드 판정을 모아
// 무엇을 할지 정한다. 정책을 App의 이벤트 핸들러에서 분리해 테스트 가능하게 둔다(§5.6 SRP).
//
//  · block   — BLOCK이 하나라도 있으면 그 첫 개를 보여주고 진행하지 않는다(막는 걸 먼저 알린다).
//  · proceed — 확인할 것이 없다 → 바로 산출물로.
//  · confirm — CONFIRM이 1건 이상. 전부 모아 한 모달에 안내한다(첫 개만 보여주고 넘어가지 않는다).

import type { GuardVerdict } from '../../domain/generation/StepGuard'

type BlockVerdict = Extract<GuardVerdict, { kind: 'BLOCK' }>
type ConfirmVerdict = Extract<GuardVerdict, { kind: 'CONFIRM' }>

export type ConfirmFlow =
  | { kind: 'block'; verdict: BlockVerdict }
  | { kind: 'proceed' }
  | { kind: 'confirm'; confirms: ConfirmVerdict[] } // 항상 length >= 1

export function planConfirmFlow(verdicts: readonly GuardVerdict[]): ConfirmFlow {
  const block = verdicts.find((v): v is BlockVerdict => v.kind === 'BLOCK')
  if (block) return { kind: 'block', verdict: block }
  const confirms = verdicts.filter((v): v is ConfirmVerdict => v.kind === 'CONFIRM')
  if (confirms.length === 0) return { kind: 'proceed' }
  return { kind: 'confirm', confirms }
}

// 스텝 가드 (Generation 컨텍스트 · 순수 도메인 서비스).
//
// "다음 단계로 가기 전에 해야 할 일을 안 했으면 막고, 왜 못 가는지·어떻게 풀지 알려준다."
//
// UI 정책(주인님 확정 2026-07-10): CTA 버튼은 **항상 활성**이고, 클릭하면 여기서 나온
// 사유·해결법을 모달로 보여준다. 버튼을 숨기거나 죽이면 사용자는 왜 못 가는지 모른다.
//
//  · BLOCK   — 진행 불가. 전제가 깨져 산출물이 틀리게 나온다.
//  · CONFIRM — 진행 가능하나 확인이 필요하다(과부하·빈 그룹·되돌리기 어려운 초기화).
//  · ALLOW   — 통과.

// 파이프라인 단계는 도메인 어휘다(라벨·표시 순서만 presentation이 갖는다).
// 도메인은 상위 레이어를 import하지 않는다(CLAUDE.md §5.1 규칙 1).
// 실 검출은 스텝이 아니다 — 도면을 열면 실이 이미 검출돼 있고, 첫 스텝은 실내기 배치다.
export type StepId = 'place' | 'combine' | 'outdoor' | 'output'

// 파이프라인 진행 순서. 뒤로 가기 판정의 근거.
export const STEP_ORDER: readonly StepId[] = ['place', 'combine', 'outdoor', 'output']

export type GuardCode =
  | 'NO_ROOMS'
  | 'ROOMS_WITHOUT_INDOOR'
  | 'UNASSIGNED_ROOMS'
  | 'NO_OUTDOOR'
  | 'OUTDOOR_NOT_PLACED'
  | 'EMPTY_SELECTION'
  | 'OVERLOADED'
  | 'EMPTY_GROUPS'
  | 'CLEARANCE'
  | 'REGRESS_INVALIDATES'
  | 'FACILITY_CHANGE'
  | 'ROOM_SLICE'
  | 'ROOM_MERGE'

export type GuardVerdict =
  | { kind: 'ALLOW' }
  | { kind: 'BLOCK'; code: GuardCode; title: string; reason: string; remedy: string }
  | { kind: 'CONFIRM'; code: GuardCode; title: string; reason: string; detail: string }

export interface GuardContext {
  roomCount: number // 검출된 실
  placedRoomCount: number // 실내기가 1대 이상 놓인 실
  roomsWithoutIndoor: string[] // 실내기가 없는 실 이름
  unassignedRoomCount: number // 실외기에 배정되지 않은 실
  activeGroupCount: number // 실내기가 연결된 실외기 대수
  emptyGroupCount: number // 실내기가 없는 실외기 대수
  overloadedGroups: string[] // 조합비 상한 초과 그룹 라벨
  groupsWithoutPosition: string[] // 도면에 심벌이 놓이지 않은 그룹 라벨
  clearanceViolations: string[] // 이격거리 위반 설명
  selectionRowCount: number // 장비선정표 행(=실) 수
}

export const emptyGuardContext = (): GuardContext => ({
  roomCount: 0,
  placedRoomCount: 0,
  roomsWithoutIndoor: [],
  unassignedRoomCount: 0,
  activeGroupCount: 0,
  emptyGroupCount: 0,
  overloadedGroups: [],
  groupsWithoutPosition: [],
  clearanceViolations: [],
  selectionRowCount: 0,
})

const block = (code: GuardCode, title: string, reason: string, remedy: string): GuardVerdict => ({ kind: 'BLOCK', code, title, reason, remedy })
const confirm = (code: GuardCode, title: string, reason: string, detail: string): GuardVerdict => ({ kind: 'CONFIRM', code, title, reason, detail })
const ALLOW: GuardVerdict = { kind: 'ALLOW' }

const NO_ROOMS = block(
  'NO_ROOMS',
  '진행할 수 없습니다',
  '도면에서 검출된 실이 없습니다.',
  '도면을 다시 불러오세요.',
)

const noOutdoor = block(
  'NO_OUTDOOR',
  '진행할 수 없습니다',
  '선정된 실외기가 없습니다.',
  '실외기 선정을 실행하거나, 조합 매핑에서 실외기를 추가하세요.',
)

// 현재 단계에서 다음 단계로 넘어가도 되는가.
// 차단 사유가 확인 사유보다 앞선다 — 못 가는 걸 먼저 알려야 한다.
export const guardAdvance = (from: StepId, c: GuardContext): GuardVerdict => {
  switch (from) {
    case 'place': {
      if (c.roomCount === 0) return NO_ROOMS
      if (c.roomsWithoutIndoor.length > 0) {
        return block(
          'ROOMS_WITHOUT_INDOOR',
          '실내기 배치를 마쳐야 합니다',
          `실 ${c.roomsWithoutIndoor.length}곳(${c.roomsWithoutIndoor.join(' · ')})에 실내기가 없습니다. ` +
            '실내기 정격용량이 확정돼야 그 부하를 감당할 실외기를 선정할 수 있습니다.',
          "'AI 실내기 배치'를 실행하거나, 실을 선택해 '＋ 실내기'로 직접 추가하세요.",
        )
      }
      return ALLOW
    }

    case 'combine': {
      if (c.unassignedRoomCount > 0) {
        return block(
          'UNASSIGNED_ROOMS',
          '배정되지 않은 실이 있습니다',
          `실 ${c.unassignedRoomCount}곳이 어느 실외기에도 연결되지 않았습니다. 산출물에서 빠집니다.`,
          "'실외기 조합 매핑'에서 미배정 실을 실외기 카드로 드래그하세요.",
        )
      }
      if (c.activeGroupCount === 0) return noOutdoor
      if (c.overloadedGroups.length > 0) {
        return confirm(
          'OVERLOADED',
          '조합비가 허용 범위를 넘었습니다',
          `과부하 실외기 ${c.overloadedGroups.length}대: ${c.overloadedGroups.join(' · ')}`,
          '이대로 진행하면 산출물에 과부하 상태가 그대로 실립니다. 실외기를 더 큰 모델로 교체하거나 그룹을 분할하는 편이 좋습니다.',
        )
      }
      if (c.emptyGroupCount > 0) {
        return confirm(
          'EMPTY_GROUPS',
          '비어 있는 실외기가 있습니다',
          `연결된 실내기가 없는 실외기 ${c.emptyGroupCount}대가 있습니다.`,
          '빈 실외기는 장비선정표·장비일람표에서 제외됩니다.',
        )
      }
      return ALLOW
    }

    case 'outdoor': {
      if (c.activeGroupCount === 0) return noOutdoor
      if (c.groupsWithoutPosition.length > 0) {
        const placed = c.activeGroupCount - c.groupsWithoutPosition.length
        return block(
          'OUTDOOR_NOT_PLACED',
          '실외기를 도면에 배치해야 합니다',
          `실외기 ${c.activeGroupCount}대 중 ${placed}대만 도면에 배치됐습니다. 미배치: ${c.groupsWithoutPosition.join(' · ')}`,
          "도면에서 '＋ 실외기 배치'를 누르거나, 실외기 심벌을 건물 외부로 끌어다 놓으세요.",
        )
      }
      if (c.clearanceViolations.length > 0) {
        return confirm(
          'CLEARANCE',
          '이격거리를 확인하세요',
          `이격거리 위반 ${c.clearanceViolations.length}건: ${c.clearanceViolations.join(' · ')}`,
          '실외기 간격(측 250 · 간 200 · 후 500 · 전 900mm)이 확보되지 않으면 시공·유지보수가 어렵습니다.',
        )
      }
      return ALLOW
    }

    case 'output':
      return c.selectionRowCount === 0
        ? block(
            'EMPTY_SELECTION',
            '생성할 산출물이 없습니다',
            '장비선정표에 행이 없습니다.',
            '실내기 배치를 먼저 완료하세요.',
          )
        : ALLOW
  }
}

// 뒤로 갈 때: 하류(실외기 조합·배치)를 무효로 만들 수 있으면 확인을 받는다.
export const guardRegress = (from: StepId, to: StepId, c: GuardContext): GuardVerdict => {
  if (STEP_ORDER.indexOf(to) >= STEP_ORDER.indexOf(from)) return ALLOW // 뒤로 가는 게 아니다
  if (c.activeGroupCount === 0) return ALLOW // 흔들릴 하류(조합)가 없다

  return confirm(
    'REGRESS_INVALIDATES',
    '앞 단계로 돌아갑니다',
    '실내기를 다시 배치하면 실외기 선정·조합이 흔들릴 수 있습니다.',
    '지금까지의 조정 내용(수정한 대수·모델·배정)이 바뀔 수 있습니다.',
  )
}

export type DestructiveAction = 'FACILITY_CHANGE' | 'ROOM_SLICE' | 'ROOM_MERGE'

// 되돌리기 어려운 액션: 실행 전에 무엇을 잃는지 알린다.
export const guardDestructive = (action: DestructiveAction, c: GuardContext): GuardVerdict => {
  switch (action) {
    // 실을 합치면 실 2곳이 1곳이 된다 → 심볼은 그대로 남지만, 두 실이 서로 다른 실외기에
    // 붙어 있었다면 한 실이 두 그룹에 걸리게 되므로(실 응집 불변식) 배정을 풀어야 한다.
    case 'ROOM_MERGE':
      return c.placedRoomCount === 0 && c.activeGroupCount === 0
        ? ALLOW
        : confirm(
            'ROOM_MERGE',
            '실을 합칩니다',
            '실 2곳이 1곳이 되어 실내기가 한 실의 대수로 합쳐집니다.',
            '합친 실은 실외기 배정이 풀려 미배정으로 돌아갑니다. 용도가 다르면 부하도 다시 계산됩니다.',
          )

    // 실을 자르면 실 1곳이 2곳이 된다 → 실내기는 심볼 위치대로 나뉘고, 실외기 조합은 다시 배정해야 한다.
    case 'ROOM_SLICE':
      return c.placedRoomCount === 0 && c.activeGroupCount === 0
        ? ALLOW // 아직 하류가 없다 — 검출 결과를 다듬는 중이다
        : confirm(
            'ROOM_SLICE',
            '실을 자릅니다',
            '실 1곳이 2곳이 되어 실내기 대수가 심볼 위치대로 다시 나뉩니다.',
            '잘린 실은 실외기 배정이 풀려 미배정으로 돌아갑니다(조합을 다시 확인해야 합니다).',
          )

    case 'FACILITY_CHANGE':
      return c.placedRoomCount === 0
        ? ALLOW // 배치 전이면 자유롭게 바꾼다 — 잃을 것이 없다
        : confirm(
            'FACILITY_CHANGE',
            '시설군을 바꿉니다',
            '시설군이 바뀌면 단위부하가 달라져 전 실의 부하가 다시 계산됩니다.',
            '실내기 선정과 실외기 조합이 초기화됩니다. 같은 실명도 시설군마다 단위부하가 다릅니다(식당: 주거 120 / 상업 210).',
          )
  }
}

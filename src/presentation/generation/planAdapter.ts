// 프리젠테이션 어댑터: 목업 배치(data.ts) ↔ 도메인(AssignmentPlan) ↔ 컴포넌트 뷰모델.
// 실외기 스펙(계열·용량·최대 연결 수·등급)은 장비마스터 카탈로그 포트에서 조회해 주입한다.
// 도메인 VO(Price/EnergyGrade)는 여기서 표시 문자열로 변환해 컴포넌트에 넘긴다(presentation은 VO 미노출).
// 목적은 "동작 보존" — 컴포넌트가 기대하는 레거시 뷰 형태를 그대로 만든다.

import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { wToKw } from '../../domain/shared/capacityUnits'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import type { GroupMeta } from '../../domain/generation/OutdoorGroup'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { IndoorUnit, indoorUnitId, roomIdsOf } from '../../domain/generation/IndoorUnit'
import { selectOutdoorUnits } from '../../domain/generation/selectOutdoorUnits'
import type { OutdoorCandidate, CompatPredicate } from '../../domain/generation/selectOutdoorUnits'
import type { EnergySourceCode } from '../../domain/shared/EnergySource'
import type { EnergyGrade } from '../../domain/shared/EnergyGrade'
import type { OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'

// 컴포넌트가 소비하는 레거시 뷰 형태(+ 표시용 등급 문자열)
export interface GroupView {
  key: string
  label: string
  model: string
  cat: string
  sys: EnergySourceCode
  cool: number
  items: string[] // 연결된 실 id (유일). 한 실에 2대가 붙어도 1개.
  unitCount: number // 연결된 실내기 '대수' — maxConnections와 같은 축
  ratio: number // 조합비. 도메인 OutdoorGroup.comboRatio()가 SSOT다(설치 정격용량 합 기준)
  judgement: 'UNDERLOADED' | 'OK' | 'OVERLOADED'
  comboMin: number // 제품군별 조합비 허용 하한 (정책 미지정 시 ComboRange.DEFAULT)
  comboMax: number // 제품군별 조합비 허용 상한
  gradeText?: string // 예: '3등급'. 등급 미부여 시 undefined
  effText?: string // 계열별 효율 지표: EHP 'EERa 4.99' / GHP 'COPc 1.55'. 없으면 undefined
}

export interface ViewModel {
  groups: GroupView[]
  pool: string[] // 미배정 실 id (유일)
}

// 실 + 선정 결과 → 실내기 유닛 목록(대수만큼). cool은 '설계부하'가 아니라 모델 '정격용량'이다.
// 유형(type=중분류)·시리즈는 실외기 선정의 조합표 호환 판정에 쓰이므로 함께 실어 나른다.
export const indoorUnitsFor = (
  room: { id: string; name: string },
  quantity: number,
  model: { coolW: number; energySource: EnergySourceCode; type?: string; series?: string },
): IndoorUnit[] =>
  Array.from({ length: quantity }, (_, i) => new IndoorUnit({
    id: indoorUnitId(room.id, i + 1),
    roomId: room.id,
    roomName: room.name,
    coolKw: wToKw(model.coolW),
    sys: model.energySource,
    subcategory: model.type,
    series: model.series,
  }))

// 장비마스터 스펙(OutdoorModelSpec) → OutdoorUnit VO. 등급·효율을 주입한다.
export const outdoorUnitFromSpec = (spec: OutdoorModelSpec): OutdoorUnit =>
  new OutdoorUnit({
    model: spec.model,
    category: spec.category,
    sys: spec.energySource,
    capacityKw: spec.capacityKw,
    maxConnections: spec.maxConnections,
    comboRange: spec.comboRange, // 제품군별 조합비 허용범위(도메인 불변식 구동)
    priceEntries: spec.prices,
    efficiencyGradeId: spec.efficiencyGradeId ?? null,
    copCooling: spec.copCooling ?? null,
    copHeating: spec.copHeating ?? null,
  })

// 모달 드롭다운 등에서 스펙의 표시용 등급 문자열이 필요할 때(컴포넌트에 VO 미노출).
export const specGradeText = (spec: OutdoorModelSpec): string | undefined => outdoorUnitFromSpec(spec).grade?.label()

// 계열별 효율 지표 라벨. 전기식(EHP/AWHP 등)은 EER, 가스식(GHP)은 냉방 COP로 표기해
// 이질 지표(가스 COP≈1.5 vs 전기 EER≈5.0) 혼동을 방지한다.
const efficiencyText = (sys: EnergySourceCode, grade: EnergyGrade | undefined): string | undefined => {
  const e = grade?.eerLabel()
  if (!e) return undefined
  const prefix = sys === 'GHP' ? 'COPc' : 'EERa'
  return `${prefix} ${e}`
}

// 초기 플랜은 완전히 비어 있다. 실외기는 '제안된 상수'가 아니라 선정 알고리즘의 결과다
// (예전 INITIAL_GROUPS/DEFAULT_COMBINATION은 목업 6실에 손으로 맞춘 배열이었다).
export const bootstrapPlan = (): AssignmentPlan => new AssignmentPlan({ groups: [], pool: [] })

// 실내기 배치 결과(desired)를 플랜에 반영한다. 배치가 SSOT이고 플랜은 그것을 따라간다.
// 판단 단위는 실이다 — 한 실의 대수는 한 곳에 함께 있어야 한다(AssignmentPlan 불변식 ②).
//
// 이미 배정된 실은 되도록 제자리에 둔다:
//   · 모델이 바뀌어 정격만 달라짐 → 그 자리에서 용량 갱신
//   · 대수가 바뀌어도 계열이 맞고 maxConnections에 여유가 있으면 → 그 자리 유지
//   · 계열이 바뀌었거나 최대 연결 대수를 넘기면 → 풀로 방출(사용자가 재배정)
//   · 배치에서 사라진 실(도면에서 지운 실내기) → 플랜에서도 사라짐
// 새 실·새 대수는 미배정 풀로 들어가고, 배정은 조합 단계에서 생긴다.
export const syncPlanUnits = (plan: AssignmentPlan, desired: readonly IndoorUnit[]): AssignmentPlan => {
  const desiredByRoom = new Map<string, IndoorUnit[]>()
  for (const u of desired) {
    const list = desiredByRoom.get(u.roomId)
    if (list) list.push(u)
    else desiredByRoom.set(u.roomId, [u])
  }

  // 유지 규칙(계열·maxConnections)은 도메인이 소유한다 — 여기서 재구현하지 않는다.
  const groups = plan.groups.map((g) => g.retainFrom(desiredByRoom))

  const assigned = new Set(groups.flatMap((g) => g.indoorUnits.map((u) => u.id)))
  const pool = desired.filter((u) => !assigned.has(u.id))
  return new AssignmentPlan({ groups, pool })
}

// 스펙(장비마스터) → 선정 알고리즘이 쓰는 후보 형태. 중분류·시리즈는 조합표 호환 판정에 쓰인다.
const candidateFromSpec = (s: OutdoorModelSpec): OutdoorCandidate => ({
  model: s.model,
  energySource: s.energySource,
  subcategory: s.category,
  series: s.series,
  capacityKw: s.capacityKw,
  heatKw: s.heatKw,
  hp: s.hp,
  maxConnections: s.maxConnections,
  comboRange: s.comboRange,
})

// 실외기 선정·조합: 배치된 실내기(정격·계열·층)로 실외기를 고르고 그룹을 만든다.
// 도메인(selectOutdoorUnits)이 규칙을 갖고, 여기서는 결과를 AssignmentPlan으로 옮긴다.
// isCompatible을 주입하면 조합표(시리즈×유형)를 따르고, 없으면 계열(EnergySource)로 판단한다.
// 실내기가 없으면 빈 플랜. 도메인 에러(NoCompatibleOutdoor/UnpackableLoad)는 그대로 전파한다.
export const selectOutdoorPlan = (
  units: readonly IndoorUnit[],
  floorOf: (roomId: string) => string,
  catalog: OutdoorModelCatalog,
  isCompatible?: CompatPredicate,
): AssignmentPlan => {
  const specByModel = new Map(catalog.list().map((s) => [s.model, s]))
  const plans = selectOutdoorUnits(
    units.map((u) => ({
      id: u.id,
      roomId: u.roomId,
      floor: floorOf(u.roomId),
      energySource: u.energySource.code,
      subcategory: u.subcategory,
      series: u.series,
      coolKw: u.cool.kw,
    })),
    catalog.list().map(candidateFromSpec),
    { isCompatible },
  )
  const unitById = new Map(units.map((u) => [u.id, u]))
  const groups = plans.map((p, i) => {
    const spec = specByModel.get(p.model)
    if (!spec) throw new Error(`장비마스터 카탈로그에 없는 실외기 모델: ${p.model}`)
    return new OutdoorGroup({
      key: `ODU${i + 1}`,
      label: `실외기-${i + 1}`,
      outdoorUnit: outdoorUnitFromSpec(spec),
      indoorUnits: p.unitIds.map((id) => unitById.get(id) as IndoorUnit),
    })
  })
  return new AssignmentPlan({ groups, pool: [] })
}

// AssignmentPlan → 컴포넌트가 소비하는 레거시 뷰 형태
export const toViewModel = (plan: AssignmentPlan): ViewModel => ({
  groups: plan.groups.map((g) => {
    const odu = g.outdoorUnit
    // 조합비·판정은 도메인이 계산한다. 프리젠테이션에서 다시 세면 값이 갈라진다.
    const ratio = g.comboRatio()
    return {
      key: g.key,
      label: g.label,
      model: odu.model.value,
      cat: odu.category,
      sys: odu.energySource.code,
      cool: odu.capacity.kw,
      items: g.roomIds,
      unitCount: g.indoorUnits.length,
      ratio: ratio.value,
      judgement: ratio.judgeWith(odu.comboRange),
      comboMin: odu.comboRange.min,
      comboMax: odu.comboRange.max,
      gradeText: odu.grade?.label(),
      effText: efficiencyText(odu.energySource.code, odu.grade),
    }
  }),
  pool: roomIdsOf(plan.pool),
})

// 기존 키(ODU_n) 다음 번호의 새 그룹 메타
export const nextGroupMeta = (plan: AssignmentPlan): GroupMeta => {
  const nums = plan.groups.map((g) => parseInt(g.key.replace('ODU', ''), 10) || 0)
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  return { key: 'ODU' + n, label: '실외기-' + n }
}

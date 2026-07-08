// 프리젠테이션 어댑터: 목업 배치(data.ts) ↔ 도메인(AssignmentPlan) ↔ 컴포넌트 뷰모델.
// 실외기 스펙(계열·용량·최대 연결 수·단가·등급)은 장비마스터 카탈로그 포트에서 조회해 주입한다.
// 도메인 VO(Price/EnergyGrade)는 여기서 표시 문자열로 변환해 컴포넌트에 넘긴다(presentation은 VO 미노출).
// 목적은 "동작 보존" — 컴포넌트가 기대하는 레거시 뷰 형태를 그대로 만든다.

import { ROOMS, INITIAL_GROUPS, INITIAL_POOL } from '../../data'
import { AssignmentPlan } from '../../domain/generation/AssignmentPlan'
import { OutdoorGroup } from '../../domain/generation/OutdoorGroup'
import type { GroupMeta } from '../../domain/generation/OutdoorGroup'
import { OutdoorUnit } from '../../domain/generation/OutdoorUnit'
import { IndoorUnit } from '../../domain/generation/IndoorUnit'
import type { EnergySourceCode } from '../../domain/shared/EnergySource'
import type { EnergyGrade } from '../../domain/shared/EnergyGrade'
import type { OutdoorModelCatalog, OutdoorModelSpec } from '../../application/generation/ports'
import { InMemoryOutdoorModelCatalog } from '../../infrastructure/generation/InMemoryOutdoorModelCatalog'

// 컴포넌트가 소비하는 레거시 뷰 형태(+ 표시용 단가·등급 문자열)
export interface GroupView {
  key: string
  label: string
  model: string
  cat: string
  sys: EnergySourceCode
  cool: number
  items: string[]
  priceText?: string // 예: '4,120,000원'. 단가 미상 시 undefined
  gradeText?: string // 예: '3등급'. 등급 미부여 시 undefined
  effText?: string // 계열별 효율 지표: EHP 'EERa 4.99' / GHP 'COPc 1.55'. 없으면 undefined
}

export interface ViewModel {
  groups: GroupView[]
  pool: string[]
}

// roomId → IndoorUnit (ROOMS 목업에서 도메인 엔티티 생성)
const indoorFromRoom = (id: string): IndoorUnit => {
  const r = ROOMS[id]
  return new IndoorUnit({ id, roomName: r.name, coolKw: r.cool, sys: r.sys })
}

// 장비마스터 스펙(OutdoorModelSpec) → OutdoorUnit VO. 단가·등급·효율을 주입한다.
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

// 모달 드롭다운 등에서 스펙의 표시용 단가/등급 문자열이 필요할 때(컴포넌트에 VO 미노출).
export const specPriceText = (spec: OutdoorModelSpec): string | undefined => outdoorUnitFromSpec(spec).defaultPrice?.format()
export const specGradeText = (spec: OutdoorModelSpec): string | undefined => outdoorUnitFromSpec(spec).grade?.label()

// 계열별 효율 지표 라벨. 전기식(EHP/AWHP 등)은 EER, 가스식(GHP)은 냉방 COP로 표기해
// 이질 지표(가스 COP≈1.5 vs 전기 EER≈5.0) 혼동을 방지한다.
const efficiencyText = (sys: EnergySourceCode, grade: EnergyGrade | undefined): string | undefined => {
  const e = grade?.eerLabel()
  if (!e) return undefined
  const prefix = sys === 'GHP' ? 'COPc' : 'EERa'
  return `${prefix} ${e}`
}

// 초기 배치(INITIAL_GROUPS: 모델+연결)를 카탈로그 스펙으로 해석해 AssignmentPlan 부트스트랩
export const bootstrapPlan = (catalog: OutdoorModelCatalog = new InMemoryOutdoorModelCatalog()): AssignmentPlan => {
  const groups = INITIAL_GROUPS.map((g) => {
    const spec = catalog.findByModel(g.model)
    if (!spec) throw new Error(`장비마스터 카탈로그에 없는 실외기 모델: ${g.model}`)
    return new OutdoorGroup({
      key: g.key,
      label: g.label,
      outdoorUnit: outdoorUnitFromSpec(spec),
      indoorUnits: g.items.map(indoorFromRoom),
    })
  })
  const pool = INITIAL_POOL.map(indoorFromRoom)
  return new AssignmentPlan({ groups, pool })
}

// AssignmentPlan → 컴포넌트가 소비하는 레거시 뷰 형태
export const toViewModel = (plan: AssignmentPlan): ViewModel => ({
  groups: plan.groups.map((g) => {
    const odu = g.outdoorUnit
    return {
      key: g.key,
      label: g.label,
      model: odu.model.value,
      cat: odu.category,
      sys: odu.energySource.code,
      cool: odu.capacity.kw,
      items: g.indoorUnits.map((i) => i.id),
      priceText: odu.defaultPrice?.format(),
      gradeText: odu.grade?.label(),
      effText: efficiencyText(odu.energySource.code, odu.grade),
    }
  }),
  pool: plan.pool.map((i) => i.id),
})

// 기존 키(ODU_n) 다음 번호의 새 그룹 메타
export const nextGroupMeta = (plan: AssignmentPlan): GroupMeta => {
  const nums = plan.groups.map((g) => parseInt(g.key.replace('ODU', ''), 10) || 0)
  const n = (nums.length ? Math.max(...nums) : 0) + 1
  return { key: 'ODU' + n, label: '실외기-' + n }
}

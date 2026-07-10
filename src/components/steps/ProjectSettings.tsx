// 프로젝트 설정 — 시설군 선택.
//
// 시설군이 있어야 단위부하가 정해진다. 같은 실명도 시설군마다 값이 다르기 때문이다
// (식당: 주거 120 / 상업 210 kcal/h·㎡). 근거: doc/03_데이터/LG전자_단위부하_참고자료.pdf
//
// 검출이 끝난 뒤 바꾸면 이미 잡힌 부하·배치·조합이 통째로 흔들린다.
// 예전에는 그래서 셀렉트를 잠갔는데, 잠그면 왜 못 바꾸는지·어떻게 바꾸는지 알 수 없었다.
// 지금은 잠그지 않고 StepGuard(FACILITY_CHANGE)가 무엇을 잃는지 알리고 확인을 받는다.

import { FACILITY_TYPES, type FacilityType } from '../../domain/shared/unitLoadTable'

export interface ProjectSettingsProps {
  facility: FacilityType
  onChange: (f: FacilityType) => void
}

export default function ProjectSettings({ facility, onChange }: ProjectSettingsProps) {
  return (
    <label className="proj-set">
      <span>시설</span>
      <select
        className="field"
        aria-label="시설군"
        value={facility}
        onChange={(e) => onChange(e.target.value as FacilityType)}
      >
        {FACILITY_TYPES.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
    </label>
  )
}

// 프로젝트 설정 — 시설군 선택. 실 검출 전에만 바꿀 수 있다.
//
// 시설군이 있어야 단위부하가 정해진다. 같은 실명도 시설군마다 값이 다르기 때문이다
// (식당: 주거 120 / 상업 210 kcal/h·㎡). 근거: doc/03_데이터/LG전자_단위부하_참고자료.pdf
//
// 검출이 끝난 뒤 시설군을 바꾸면 이미 잡힌 부하·배치·조합이 통째로 흔들린다.
// 그래서 검출 이후에는 잠근다(바꾸려면 '← 이전'으로 되돌아간다).

import { FACILITY_TYPES, type FacilityType } from '../../domain/shared/unitLoadTable'

export interface ProjectSettingsProps {
  facility: FacilityType
  locked: boolean
  onChange: (f: FacilityType) => void
}

export default function ProjectSettings({ facility, locked, onChange }: ProjectSettingsProps) {
  return (
    <label className="proj-set">
      <span>시설</span>
      <select
        className="field"
        aria-label="시설군"
        value={facility}
        disabled={locked}
        title={locked ? '실 검출 후에는 시설을 바꿀 수 없습니다' : undefined}
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

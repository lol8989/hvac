// 도면 격자 — **표시 격자와 스냅 격자는 하나다**(SSOT).
//
// 화면에 그린 격자선과 실제로 붙는 격자가 다르면 "격자" 체크박스가 거짓말을 한다.
// (예전 결함: 심볼 드래그는 좌표계와 무관한 상수 GRID=20에, 실 자르기는 실치수 격자에
//  스냅했다. 실도면에서 격자 1칸은 2000mm=21.1단위라 심볼이 격자선에 안 붙었다.)
//
// 이 파일이 바뀌는 이유는 하나: **도면 좌표계를 격자로 어떻게 나눌 것인가**.
//
// 축척(mmPerUnit)을 아는 실도면이면 '딱 떨어지는 실치수'(1·2·5·10 계열)를 고르고,
// 모르는 목업 좌표계면 정규화 단위 기본 격자를 쓴다 — 없는 치수를 지어내지 않는다.

export const MOCK_GRID = 20 // 축척 불명(목업) 좌표계의 기본 격자(정규화 단위)

export interface PlanGrid {
  step: number // 격자 간격(정규화 단위) — 표시·스냅 공용
  mm: number | null // 격자 1칸의 실 치수(mm). 축척을 모르면 null
  label: string | null // 화면 표기('2m'·'500mm'). 축척을 모르면 표기하지 않는다
}

// 도면 폭에 맞는 '딱 떨어지는' 격자 실치수(1·2·5·10 계열, ~100칸 목표).
export const niceGridMm = (widthMm: number): number => {
  const target = widthMm / 100
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  return [1, 2, 5, 10].map((m) => m * pow).find((c) => c >= target) ?? 10 * pow
}

const labelOf = (mm: number): string => (mm >= 1000 ? `${mm / 1000}m` : `${mm}mm`)

export const planGridOf = (planW: number, mmPerUnit?: number): PlanGrid => {
  if (!mmPerUnit) return { step: MOCK_GRID, mm: null, label: null }
  const mm = niceGridMm(planW * mmPerUnit)
  return { step: mm / mmPerUnit, mm, label: labelOf(mm) }
}

// 가장 가까운 격자점으로. step이 유효하지 않으면 그대로 둔다(0으로 나누지 않는다).
export const snapTo = (v: number, step: number): number => (step > 0 ? Math.round(v / step) * step : v)

// 층 식별자 정렬 키 (Generation 컨텍스트).
//
// 층 식별자는 **우리가 정한 표준 문자열**이다(주인님 확정 2026-07-15).
// 검출·임포트가 이 형식으로 값을 맞춰 넣는다. 실무 층은 한 DXF 안에 '나란히' 배치되므로
// 좌표가 아니라 '순서'만 있으면 되고, 이 함수가 그 순서(작을수록 아래층)를 준다.
//
// 표준 문법:
//   지하{N}층  → -N   (지하2층 = -2, 지하1층 = -1)   ※ 깊을수록 아래(작은 값)
//   지상{N}층  → +N   (지상1층 =  1)
//   {N}층      → +N   (지상 접두 생략형. '3층' = 3)
//   옥탑 / 옥탑층 → 최상단(어떤 지상층보다 위)
// 위 형식이 아니면 +Infinity — 정렬 시 맨 뒤로 밀되, 원문은 표시용으로 호출부가 보존한다.
// 설계: doc/05_설계결정/층_전환_설계_v1.md §5

// 옥탑은 현실 최고층(수십)보다 확실히 크면 된다.
const ROOFTOP = 100_000

export function floorOrder(floor: string): number {
  const s = floor.trim()

  const base = /^지하(\d+)층$/.exec(s)
  if (base) return -Number(base[1])

  const above = /^지상(\d+)층$/.exec(s)
  if (above) return Number(above[1])

  const bare = /^(\d+)층$/.exec(s)
  if (bare) return Number(bare[1])

  if (/^옥탑층?$/.test(s)) return ROOFTOP

  return Number.POSITIVE_INFINITY
}

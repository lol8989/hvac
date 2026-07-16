// 실내기↔실외기 호환성 매트릭스 — 장비마스터(Equipment Master) 기준데이터 값객체.
//
// '무엇이 물리적으로 연결 가능한가'를 실외기 시리즈 × 실내기(중분류+시리즈) 격자로 담는다.
// 현업(고객사)이 확정한 조합표가 원천이다(seed: infrastructure/.../compatMatrixSeed.ts).
// 실제 조합·조합비 판단은 생성(Generation) 단이 이 표를 참조해 수행한다(CLAUDE.md §1) — 이 VO는 사실만 보유.
//
// 불변 + 자기검증. Clean Architecture: 프레임워크·시드(infrastructure)에 의존하지 않는다.
// 시드로부터의 조립은 infrastructure 어댑터가 맡고, 이 도메인은 순수 데이터(축 + 값)만 받는다.

export type CompatValue = 'O' | 'X' | '-' | 'D'

const VALUES = new Set<CompatValue>(['O', 'X', '-', 'D'])

export const isCompatValue = (v: unknown): v is CompatValue => typeof v === 'string' && VALUES.has(v as CompatValue)

// 축 라벨을 이어 키를 만들 때 쓰는 구분자(U+241F, 유닛 세퍼레이터 기호). 라벨엔 등장하지 않는다 —
// 생성자가 이를 불변식으로 강제한다(등장하면 throw). override 키(infrastructure)도 같은 구분자를 공유한다.
export const AXIS_SEP = '␟'

// 매트릭스의 한 축(실외기 행 또는 실내기 열). (중분류, 시리즈)로 식별한다 —
// 같은 시리즈명도 중분류가 다르면 다른 축이다(예: 냉난방 절환형/Multi V S ↔ 냉방전용/Multi V S).
export interface CompatAxis {
  energySource: string
  subcategory: string
  series: string
}

type AxisLabel = Pick<CompatAxis, 'subcategory' | 'series'>

const axisKey = (a: AxisLabel): string => `${a.subcategory}${AXIS_SEP}${a.series}`

export class CompatMatrix {
  readonly outdoorRows: readonly CompatAxis[]
  readonly indoorColumns: readonly CompatAxis[]
  // `${outdoorKey}${AXIS_SEP}${AXIS_SEP}${indoorKey}` → 값
  private readonly cells: ReadonlyMap<string, CompatValue>

  // rowValues[i] = i번째 실외기 행의 값 문자열(열 순서대로 한 칸당 한 글자 O/X/-/D).
  constructor(outdoorRows: readonly CompatAxis[], indoorColumns: readonly CompatAxis[], rowValues: readonly string[]) {
    if (rowValues.length !== outdoorRows.length) {
      throw new Error(`행 개수 불일치: 실외기 ${outdoorRows.length}행인데 값은 ${rowValues.length}행`)
    }
    assertDistinct(outdoorRows, '실외기 행')
    assertDistinct(indoorColumns, '실내기 열')

    const cells = new Map<string, CompatValue>()
    outdoorRows.forEach((row, r) => {
      const chars = [...rowValues[r]]
      if (chars.length !== indoorColumns.length) {
        throw new Error(`열 길이 불일치: '${row.series}' 행의 값 ${chars.length}칸, 실내기 ${indoorColumns.length}열`)
      }
      chars.forEach((ch, c) => {
        if (!VALUES.has(ch as CompatValue)) throw new Error(`잘못된 조합 값 '${ch}' ('${row.series}' 행)`)
        cells.set(this.cellKey(row, indoorColumns[c]), ch as CompatValue)
      })
    })
    this.outdoorRows = Object.freeze([...outdoorRows])
    this.indoorColumns = Object.freeze([...indoorColumns])
    this.cells = cells
    Object.freeze(this)
  }

  private cellKey(outdoor: AxisLabel, indoor: AxisLabel): string {
    return `${axisKey(outdoor)}${AXIS_SEP}${AXIS_SEP}${axisKey(indoor)}`
  }

  valueAt(outdoor: AxisLabel, indoor: AxisLabel): CompatValue {
    const v = this.tryValueAt(outdoor, indoor)
    if (v === null) throw new Error(`알 수 없는 축: 실외기 '${outdoor.series}' × 실내기 '${indoor.series}'`)
    return v
  }

  // 축이 없으면 throw 대신 null. (생성단 호환 판정처럼 '조합표에 없으면 계열로 폴백'할 때 쓴다.)
  tryValueAt(outdoor: AxisLabel, indoor: AxisLabel): CompatValue | null {
    return this.cells.get(this.cellKey(outdoor, indoor)) ?? null
  }

  // 연결 가능 여부. O(가능)·D(전용 제품도 연결됨)는 true, X(불가)·-(멀티 대상 아님)는 false.
  isCompatible(outdoor: AxisLabel, indoor: AxisLabel): boolean {
    const v = this.valueAt(outdoor, indoor)
    return v === 'O' || v === 'D'
  }

  // 한 칸을 바꾼 새 매트릭스를 반환한다(원본 불변).
  withValue(outdoor: AxisLabel, indoor: AxisLabel, value: CompatValue): CompatMatrix {
    this.valueAt(outdoor, indoor) // 존재하지 않는 축이면 throw
    const rowValues = this.outdoorRows.map((row) =>
      this.indoorColumns
        .map((col) => (axisKey(row) === axisKey(outdoor) && axisKey(col) === axisKey(indoor) ? value : this.valueAt(row, col)))
        .join(''),
    )
    return new CompatMatrix(this.outdoorRows, this.indoorColumns, rowValues)
  }
}

// 축은 (중분류,시리즈)로 유일해야 한다. 중복이면 셀이 서로 덮어써 편집이 엉뚱한 칸으로 번진다.
// 라벨에 구분자(AXIS_SEP)가 섞이면 키 경계가 무너지므로 함께 막는다.
function assertDistinct(axes: readonly CompatAxis[], label: string): void {
  const seen = new Set<string>()
  for (const a of axes) {
    if (a.subcategory.includes(AXIS_SEP) || a.series.includes(AXIS_SEP)) {
      throw new Error(`${label} 라벨에 예약 구분자가 있습니다: '${a.subcategory}/${a.series}'`)
    }
    const k = axisKey(a)
    if (seen.has(k)) throw new Error(`${label} 축이 중복됩니다: '${a.subcategory}/${a.series}'`)
    seen.add(k)
  }
}

import { describe, it, expect } from 'vitest'
import { buildScheduleRows, toCsv } from './schedule'
import type { GroupView } from './planAdapter'
import type { Room, ModelCard } from '../../data'

// 테스트 픽스처(목업 축약형)
const room = (name: string, cool: number): Room => ({ name, floor: '지상1층', usage: '거실', area: 20, type: '4WAY', cool, sys: 'EHP', x: 0, y: 0, w: 100, h: 100 })
const ROOMS_FX: Record<string, Room> = {
  AC_001: room('거실', 11.2),
  AC_002: room('침실', 5.6),
  AC_003: room('회의실', 9.0),
}
const grp = (key: string, label: string, model: string, items: string[]): GroupView => ({
  key, label, model, cat: '냉난방 절환형', sys: 'EHP', cool: 34.8, items, comboMin: 0.5, comboMax: 1.3,
})
const CARDS: ModelCard[] = [
  { mn: 'R-W0601A2U', ms: '4WAY 카세트 · 냉방 6.0kW', md: '적용 2026.04.20', on: false, cool: 6.0, kind: '4WAY' },
  { mn: 'R-W0901A2U', ms: '4WAY 카세트 · 냉방 9.0kW', md: '적용 2026.04.20', on: false, cool: 9.0, kind: '4WAY' },
]

describe('buildScheduleRows (장비일람표 행 생성)', () => {
  it('연결 실내기가 있는 실외기 그룹을 모델별로 집계하면 수량이 그룹 수가 된다', () => {
    const groups = [
      grp('ODU1', '실외기-1', 'RPUW12BX9M', ['AC_001']),
      grp('ODU2', '실외기-2', 'RPUW12BX9M', ['AC_002']),
    ]
    const rows = buildScheduleRows(groups, {}, ROOMS_FX, CARDS)
    const odu = rows.filter((r) => r.구분 === '실외기')
    expect(odu).toHaveLength(1)
    expect(odu[0].모델명).toBe('RPUW12BX9M')
    expect(odu[0].수량).toBe(2)
    expect(odu[0].연결).toBe('실외기-1, 실외기-2')
  })

  it('빈 실외기 그룹(연결 0)은 일람표에서 제외한다', () => {
    const rows = buildScheduleRows([grp('ODU1', '실외기-1', 'RPUW12BX9M', [])], {}, ROOMS_FX, CARDS)
    expect(rows.filter((r) => r.구분 === '실외기')).toHaveLength(0)
  })

  it('실내기는 적용된 모델별로 집계하고 연결 컬럼에 실 id를 나열한다', () => {
    const indoorByRoom = { AC_001: 'R-W0901A2U', AC_002: 'R-W0601A2U', AC_003: 'R-W0901A2U' }
    const rows = buildScheduleRows([], indoorByRoom, ROOMS_FX, CARDS)
    const idu = rows.filter((r) => r.구분 === '실내기')
    expect(idu).toHaveLength(2)
    const r9 = idu.find((r) => r.모델명 === 'R-W0901A2U')
    expect(r9?.수량).toBe(2)
    expect(r9?.연결).toBe('AC_001, AC_003')
    expect(r9?.사양).toBe('4WAY 카세트 · 냉방 9.0kW')
  })

  it('실내기 미적용 실은 제외하고, 카탈로그에 없는 모델도 행으로 남긴다', () => {
    const rows = buildScheduleRows(
      [grp('ODU1', '실외기-1', 'RPUW12BX9M', ['AC_001'])],
      { AC_001: '카탈로그에없는모델' },
      ROOMS_FX,
      CARDS,
    )
    const idu = rows.find((r) => r.구분 === '실내기')
    expect(idu?.사양).toBe('') // 카탈로그 미등재 → 사양 공란
    expect(rows.filter((r) => r.구분 === '실내기')).toHaveLength(1) // AC_002/003 미적용 → 제외
  })
})

describe('toCsv (Excel 호환 CSV 직렬화)', () => {
  it('헤더 + 데이터 행을 만들고, 쉼표 포함 필드는 따옴표로 감싼다', () => {
    const rows = buildScheduleRows(
      [grp('ODU1', '실외기-1', 'RPUW12BX9M', ['AC_001']), grp('ODU2', '실외기-2', 'RPUW12BX9M', ['AC_002'])],
      { AC_001: 'R-W0901A2U' },
      ROOMS_FX,
      CARDS,
    )
    const csv = toCsv(rows)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('구분,모델명,사양,수량,연결')
    expect(lines).toHaveLength(1 + rows.length)
    expect(csv).toContain('"실외기-1, 실외기-2"') // 쉼표 포함 필드 → 인용
  })

  it('따옴표 포함 필드는 이중 따옴표로 이스케이프한다', () => {
    const csv = toCsv([{ 구분: '실내기', 모델명: 'M"X', 사양: '', 수량: 1, 연결: 'AC_001' }])
    expect(csv).toContain('"M""X"')
  })
})

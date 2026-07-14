// 장비선정표(SelectionTable) → CSV 직렬화 (presentation).
// 엑셀 양식 모방: 행=실, 층별 칸은 섹션 첫 행에만, 층 소계 행, 하단 BOM(집계) 섹션.
// 인용 규칙은 RFC4180(schedule.ts의 toCsv와 동일 방식) — 쉼표·따옴표·개행 포함 필드만 인용.

import type { FloorSection, SelectionRow, SelectionTable } from '../../domain/generation/SelectionTable'

// 헤더 23컬럼 (엑셀 양식 순서 고정)
const HEADER =
  '층별,실명,면적(㎡),단위부하 냉방(kcal/h㎡),단위부하 난방(kcal/h㎡),단위부하 냉방(W/㎡),단위부하 난방(W/㎡),' +
  '필요부하 냉방(W),필요부하 난방(W),장비번호,실내기 모델명,냉방용량(W),난방용량(W),대수,총냉방용량(W),총난방용량(W),' +
  '실외기 장비번호(HP),실외기 모델명,실외기 냉방용량(W),실외기 난방용량(W),대수,조합비,비고'

const COLS = 23

// RFC4180: 쉼표/따옴표/개행 포함 필드만 인용, 내부 따옴표는 두 번.
const csvField = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toLine = (fields: readonly (string | number)[]): string => fields.map(csvField).join(',')

// W값 소수 1자리 반올림 (정수면 소수점 없이 표기)
const w = (v: number): string => String(Math.round(v * 10) / 10)

// 실 1개 → 데이터 행 (층별 칸은 섹션 첫 행에만, 실외기 칸은 부착 행에만)
const dataRow = (r: SelectionRow, floorLabel: string): (string | number)[] => {
  const i = r.indoor
  const o = r.outdoor
  return [
    floorLabel,
    r.roomName,
    // 자른 실의 면적은 비율 계산 결과라 15자리 부동소수가 나온다 — 엑셀 양식은 소수 1자리다.
    w(r.areaM2),
    r.unitLoad.coolKcal,
    r.unitLoad.heatKcal,
    w(r.unitLoad.coolW),
    w(r.unitLoad.heatW),
    w(r.requiredW.cool),
    w(r.requiredW.heat),
    i ? i.code : '',
    i ? i.model : '',
    i ? w(i.coolW) : '',
    i ? w(i.heatW) : '',
    i ? i.quantity : '',
    i ? w(i.totalCoolW) : '',
    i ? w(i.totalHeatW) : '',
    o ? o.hp : '',
    o ? o.model : '',
    o ? w(o.coolKw * 1000) : '', // 실외기 용량 kW→W 변환
    o && o.heatKw !== null ? w(o.heatKw * 1000) : '',
    o ? o.quantity : '',
    o ? o.comboRatio.toFixed(4) : '', // 조합비 소수 4자리
    '', // 비고 (규칙 미정 — 공란 유지)
  ]
}

// 층 소계 행: 실명 칸 '합계', 대수/총냉방/총난방만 기입
const subtotalRow = (f: FloorSection): string[] => {
  const cells: string[] = Array(COLS).fill('')
  cells[1] = '합계'
  cells[13] = String(f.subtotal.quantity)
  cells[14] = w(f.subtotal.totalCoolW)
  cells[15] = w(f.subtotal.totalHeatW)
  return cells
}

export const buildSelectionCsv = (table: SelectionTable): string => {
  const lines: string[] = [HEADER]
  for (const f of table.floors) {
    f.rows.forEach((r, idx) => lines.push(toLine(dataRow(r, idx === 0 ? f.floor : ''))))
    lines.push(toLine(subtotalRow(f)))
  }
  // 하단 BOM(집계) 섹션: 빈 행 + 구분 행 + 실내기/실외기 집계 + HP 합계
  lines.push('')
  lines.push('— 집계 —')
  for (const v of table.bom.indoor) lines.push(toLine(['실내기', v.code, v.model, v.quantity]))
  for (const v of table.bom.outdoor) lines.push(toLine(['실외기', `${v.hp}HP`, v.model, v.quantity]))
  lines.push(toLine(['HP 합계', table.bom.hpTotal]))
  return lines.join('\n')
}

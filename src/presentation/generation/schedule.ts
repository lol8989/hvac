// 장비일람표 산출(목업 데이터 기반): 실외기 그룹·실내기 배정 → 모델별 집계 행 → CSV(Excel 호환).
// 실서비스에서는 서버 산출물 생성 워커가 담당 — POC는 화면 상태 + 목업 카탈로그로 생성한다.

import type { GroupView } from './planAdapter'
import type { Room, ModelCard } from '../../data'

export interface ScheduleRow {
  구분: '실외기' | '실내기'
  모델명: string
  사양: string
  수량: number
  연결: string // 실외기: 그룹 라벨 목록 / 실내기: 설치 실 id 목록
  단가: string
}

// 실외기(연결 있는 그룹만) + 실내기(적용 모델 있는 실만)를 모델별로 집계한다.
export const buildScheduleRows = (
  groups: GroupView[],
  indoorByRoom: Record<string, string>,
  rooms: Record<string, Room>,
  indoorCards: ModelCard[],
): ScheduleRow[] => {
  const rows: ScheduleRow[] = []

  const oduByModel = new Map<string, GroupView[]>()
  for (const g of groups.filter((g) => g.items.length)) {
    oduByModel.set(g.model, [...(oduByModel.get(g.model) ?? []), g])
  }
  for (const [model, gs] of oduByModel) {
    rows.push({
      구분: '실외기',
      모델명: model,
      사양: `${gs[0].cat} · 냉방 ${gs[0].cool}kW · ${gs[0].sys}`,
      수량: gs.length,
      연결: gs.map((g) => g.label).join(', '),
      단가: gs[0].priceText ?? '미상',
    })
  }

  const iduByModel = new Map<string, string[]>()
  for (const id of Object.keys(rooms)) {
    const model = indoorByRoom[id]
    if (model) iduByModel.set(model, [...(iduByModel.get(model) ?? []), id])
  }
  for (const [model, ids] of iduByModel) {
    const card = indoorCards.find((c) => c.mn === model)
    rows.push({
      구분: '실내기',
      모델명: model,
      사양: card?.ms ?? '',
      수량: ids.length,
      연결: ids.join(', '),
      단가: card?.mp ?? '미상',
    })
  }
  return rows
}

// RFC4180 인용 규칙(쉼표·따옴표·개행 포함 필드만 인용).
const csvField = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const toCsv = (rows: ScheduleRow[]): string => {
  const header = '구분,모델명,사양,수량,연결,단가'
  const lines = rows.map((r) => [r.구분, r.모델명, r.사양, r.수량, r.연결, r.단가].map(csvField).join(','))
  return [header, ...lines].join('\n')
}

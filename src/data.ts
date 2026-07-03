// 목업 데이터 (장비일람표 기반). 실제 서비스에서는 장비마스터 API에서 로드.

import type { EnergySourceCode } from './domain/shared/EnergySource'

export interface Room {
  name: string
  area: number
  type: string
  cool: number
  sys: EnergySourceCode
  x: number
  y: number
  w: number
  h: number
}

export const ROOMS: Record<string, Room> = {
  AC_001: { name: '거실', area: 31.89, type: '4WAY', cool: 11.2, sys: 'EHP', x: 24, y: 24, w: 250, h: 150 },
  AC_002: { name: '침실1', area: 18.5, type: '1WAY', cool: 5.6, sys: 'EHP', x: 292, y: 24, w: 180, h: 110 },
  AC_003: { name: '회의실', area: 28.5, type: '4WAY', cool: 9.0, sys: 'EHP', x: 490, y: 24, w: 206, h: 150 },
  AC_004: { name: '사무실', area: 42.0, type: '4WAY', cool: 14.0, sys: 'EHP', x: 24, y: 196, w: 250, h: 150 },
  AC_005: { name: '로비', area: 55.0, type: '4WAY', cool: 22.4, sys: 'EHP', x: 292, y: 152, w: 180, h: 194 },
  AC_006: { name: '탕비실', area: 12.0, type: '1WAY', cool: 4.5, sys: 'EHP', x: 490, y: 196, w: 206, h: 150 },
}

// 실외기 스펙 카탈로그 항목. 장비마스터(Equipment Master)가 게시(PUBLISHED)하는
// 실외기 모델 스펙의 단일 진실 공급원(SSOT) 목업.
//   maxConn = 최대 연결 실내기 수 (모델 스펙). 조합 시 OutdoorGroup의 불변식에 주입된다.
export interface OduCatalogEntry {
  model: string
  cat: string
  sys: EnergySourceCode
  cool: number
  maxConn: number
}

// 실외기 배치 레이아웃 (어떤 모델을 어느 실외기 위치에 두고 어떤 실내기를 연결하는가).
// 스펙(계열·용량·최대연결수)은 카탈로그(ODU_CATALOG)를 모델로 조회한다 — 중복 금지.
export interface InitialGroup {
  key: string
  label: string
  model: string
  items: string[]
}

export const INITIAL_GROUPS: InitialGroup[] = [
  { key: 'ODU1', label: '실외기-1', model: 'RPUW12BX9M', items: ['AC_001', 'AC_003', 'AC_006'] },
  { key: 'ODU2', label: '실외기-2', model: 'RPUW20BX9P', items: ['AC_004', 'AC_005'] },
  { key: 'ODU3', label: '실외기-3', model: 'GPUW280C2S', items: [] },
]

export const INITIAL_POOL: string[] = ['AC_002']

// 장비마스터 PUBLISHED 실외기 스펙 (SSOT). maxConn은 모델별 최대 연결 실내기 수.
export const ODU_CATALOG: OduCatalogEntry[] = [
  { model: 'RPUW08BX9E', cat: '냉난방 절환형', sys: 'EHP', cool: 22.4, maxConn: 13 },
  { model: 'RPUW12BX9M', cat: '냉난방 절환형', sys: 'EHP', cool: 34.8, maxConn: 20 },
  { model: 'RPUW16BX9M', cat: '냉난방 절환형', sys: 'EHP', cool: 45.0, maxConn: 26 },
  { model: 'RPUW20BX9P', cat: '냉난방 절환형', sys: 'EHP', cool: 57.0, maxConn: 33 },
  { model: 'RPUQ141X9S', cat: '냉방전용', sys: 'EHP', cool: 39.2, maxConn: 23 },
  { model: 'GPUW280C2S', cat: 'GHP', sys: 'GHP', cool: 28.0, maxConn: 16 },
  { model: 'GPUW450C2S', cat: 'GHP', sys: 'GHP', cool: 45.0, maxConn: 26 },
]

export interface ModelCard {
  mn: string
  ms: string
  mp: string
  md: string
  on: boolean
}

export const MODELS: { in: ModelCard[]; out: ModelCard[] } = {
  in: [
    { mn: 'LG AMNW09GTRA0', ms: '벽걸이형 · 냉방 2.64kW · 난방 3.30kW · 1등급', mp: '642,900원', md: '적용 2026.07.08', on: true },
    { mn: 'R-W0401A2U', ms: '4WAY 카세트 · 냉방 4.0kW · 난방 4.5kW', mp: '660,000원', md: '적용 2026.04.20', on: false },
    { mn: 'R-W0601A2U', ms: '4WAY 카세트 · 냉방 6.0kW · 난방 6.8kW', mp: '780,000원', md: '적용 2026.04.20', on: false },
  ],
  out: [
    { mn: 'RPUW12BX9M', ms: '냉난방 절환형 · 냉방 34.8kW · EERa 4.99 · 3등급', mp: '4,120,000원', md: '적용 2026.04.20', on: true },
    { mn: 'RPUW20BX9P', ms: '냉난방 절환형 · 냉방 57.0kW · EERa 4.99 · 3등급', mp: '6,350,000원', md: '적용 2026.04.20', on: false },
    { mn: 'RPUQ141X9S', ms: '냉방전용 · 냉방 39.2kW · EER 4.00', mp: '3,760,000원', md: '적용 2026.02.20', on: false },
  ],
}

// 조합비 = 연결 실내기 냉방용량 합 / 실외기 용량
export const ratioOf = (group: { items: string[]; cool: number }): number => {
  const sum = group.items.reduce((a, id) => a + (ROOMS[id]?.cool || 0), 0)
  return group.cool ? sum / group.cool : 0
}

export const groupOfRoom = <T extends { items: string[] }>(groups: T[], roomId: string): T | null =>
  groups.find((g) => g.items.includes(roomId)) || null

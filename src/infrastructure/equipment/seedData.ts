// 장비마스터 시드 데이터 (SSOT 목업) — 인메모리·SQLite 백엔드가 공유하는 단일 출처.
// 근거: 표준 260415 장비선정표 엑셀 — 실내기 Multi V Super 탭(20C/40C/110T 실측, 나머지 난방 ×1.10~1.13 보간),
//       실외기 스펙(냉난방/HP/최대연결수). ⚠️ 단가·등급·COP는 POC 플레이스홀더(미확정, 실데이터 교체 예정).

import type { IndoorMasterRecord, OutdoorMasterRecord } from '../../domain/equipment/MasterRecord'
import { PUBLISH_STATUS } from '../../domain/equipment/PublishStatus'

const CASSETTE = '4WAY 카세트'
const DUCT = '덕트'
const P = PUBLISH_STATUS.PUBLISHED

// [code, model, coolW, heatW, type] — 전부 계열 EHP, 게시(PUBLISHED).
const INDOOR_SEED: ReadonlyArray<[string, string, number, number, string]> = [
  // C시리즈 (4WAY 카세트)
  ['20C', 'RNW0201C2S', 2000, 2200, CASSETTE],
  ['23C', 'RNW0231C2S', 2300, 2600, CASSETTE],
  ['32C', 'RNW0321C2S', 3200, 3600, CASSETTE],
  ['40C', 'RNW0401C2S', 4000, 4500, CASSETTE],
  ['52C', 'RNW0521C2S', 5200, 5800, CASSETTE],
  ['60C', 'RNW0601C2S', 6000, 6700, CASSETTE],
  ['72C', 'RNW0721C2S', 7200, 8100, CASSETTE],
  // T시리즈 (덕트)
  ['40T', 'RNW0401A2U', 4000, 4500, DUCT],
  ['52T', 'RNW0521A2U', 5200, 5800, DUCT],
  ['60T', 'RNW0601A2U', 6000, 6700, DUCT],
  ['72T', 'RNW0721A2U', 7200, 8100, DUCT],
  ['83T', 'RNW0831A2U', 8300, 9300, DUCT],
  ['100T', 'RNW1001A2U', 10000, 11200, DUCT],
  ['110T', 'RNW1101A2U', 11000, 12400, DUCT],
  ['130T', 'RNW1301A2U', 13000, 14600, DUCT],
  ['145T', 'RNW1451A2U', 14500, 16300, DUCT],
]

export const INDOOR_RECORDS: readonly IndoorMasterRecord[] = [
  ...INDOOR_SEED.map(([code, model, coolW, heatW, type]): IndoorMasterRecord => ({ status: P, code, model, coolW, heatW, type, energySource: 'EHP' })),
  // 게시 게이트 실증용: 아직 등록만 된 DRAFT 모델은 생성/검도에 노출되지 않아야 한다.
  { status: PUBLISH_STATUS.DRAFT, code: 'DRAFT99', model: 'RNW9999DRAFT', coolW: 9000, heatW: 10000, type: CASSETTE, energySource: 'EHP' },
]

const D = '2026-04-20' // effectiveStartDate 공통(목업)
// heatKw = 냉방 ×1.12 근사 목업(냉방전용은 null). comboMin/Max 전부 미지정(기본 0.5~1.3).
// 실측 앵커: RPUW12BX9M/RPUW20BX9P/RPUQ141X9S, 나머지는 용량 스케일 보간.
export const OUTDOOR_RECORDS: readonly OutdoorMasterRecord[] = [
  { status: P, model: 'RPUW08BX9E', cat: '냉난방 절환형', sys: 'EHP', cool: 22.4, heatKw: 25.1, hp: 8, maxConn: 13, priceKrw: 2980000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 3278000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 2, copCooling: 5.1, copHeating: 4.3 },
  { status: P, model: 'RPUW12BX9M', cat: '냉난방 절환형', sys: 'EHP', cool: 34.8, heatKw: 39.0, hp: 12, maxConn: 20, priceKrw: 4120000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 4532000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 3, copCooling: 4.99, copHeating: 4.2 },
  { status: P, model: 'RPUW16BX9M', cat: '냉난방 절환형', sys: 'EHP', cool: 45.0, heatKw: 50.4, hp: 16, maxConn: 26, priceKrw: 5240000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 5764000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 3, copCooling: 4.8, copHeating: 4.05 },
  { status: P, model: 'RPUW20BX9P', cat: '냉난방 절환형', sys: 'EHP', cool: 57.0, heatKw: 63.8, hp: 20, maxConn: 33, priceKrw: 6350000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 6985000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 3, copCooling: 4.99, copHeating: 4.1 },
  { status: P, model: 'RPUQ141X9S', cat: '냉방전용', sys: 'EHP', cool: 39.2, heatKw: null, hp: 14, maxConn: 23, priceKrw: 3760000, priceTypeCode: 'CONSUMER', priceWithVatKrw: null, effectiveStartDate: D, priority: 10, efficiencyGradeId: null, copCooling: 4.0, copHeating: null },
  { status: P, model: 'GPUW280C2S', cat: 'GHP', sys: 'GHP', cool: 28.0, heatKw: 31.4, hp: 10, maxConn: 16, priceKrw: 8900000, priceTypeCode: 'CONSUMER', priceWithVatKrw: 9790000, effectiveStartDate: D, priority: 10, efficiencyGradeId: 4, copCooling: 1.55, copHeating: 1.45 },
  { status: P, model: 'GPUW450C2S', cat: 'GHP', sys: 'GHP', cool: 45.0, heatKw: 50.4, hp: 16, maxConn: 26, priceKrw: 12400000, priceTypeCode: 'CONSUMER', priceWithVatKrw: null, effectiveStartDate: D, priority: 10, efficiencyGradeId: 4, copCooling: 1.5, copHeating: 1.4 },
  // 게시 게이트 실증용: 단종(ARCHIVED) 모델은 생성/검도에 노출되지 않아야 한다.
  { status: PUBLISH_STATUS.ARCHIVED, model: 'RPUW-ARCHIVED', cat: '냉난방 절환형', sys: 'EHP', cool: 22.4, heatKw: 25.1, hp: 8, maxConn: 13, priceKrw: 2500000, priceTypeCode: 'CONSUMER', priceWithVatKrw: null, effectiveStartDate: '2020-01-01', priority: 99, efficiencyGradeId: 5, copCooling: 3.9, copHeating: 3.5 },
]

// FNV-1a 32bit 문자열 해시(base36). 순수·결정적.
export function fnv1a(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

// 시드 내용 해시 — IndexedDB 캐시 무효화 키에 사용한다.
// 단가·등급·COP 등 시드 '값'만 바뀌어도(스키마 구조 불변) 해시가 달라져 옛 캐시가 자동 무효화된다
// → 재방문 사용자도 항상 현행 시드로 재시드되어 인메모리 마스터와 동치가 유지된다(수동 버전 갱신 불요).
export const SEED_HASH = fnv1a(JSON.stringify([INDOOR_RECORDS, OUTDOOR_RECORDS]))

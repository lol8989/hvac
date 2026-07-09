// 스펙시트 업로드(제품 등록) 도메인 타입 + 검증 분류. 순수 도메인 — 파일 포맷·React 무지.
//
// 업로드는 '제품 등록'이다(주인님 결정 2026-07-09): 정규화 hot 필드는 products 컬럼으로,
// 나머지 롱테일(전원·배관경·전선·차단기·냉매·소음·중량…)은 product_specs JSONB로 적재한다.
// 적재 상태는 항상 DRAFT — 관리자가 확인 후 게시해야 생성·검도에 노출된다.

import { horsepowerFromModelCode } from './ModelCode'

// 시트 한 칸의 원본 값 + 단위(롱테일 스펙 보존용).
export interface SpecCell {
  value: string
  unit: string | null
}

// 시트에서 뽑아낸 모델 1건.
export interface ParsedProduct {
  modelCode: string
  coolingW: number | null // 정격 냉방능력(W)
  heatingW: number | null // 정격 난방능력(W)
  maxConnections: number | null // 최대 연결 실내기 수
  specData: Record<string, SpecCell> // "대분류 > 소분류" → 값·단위
}

export type ImportVerdict = 'OK' | 'DUPLICATE' | 'ERROR'

export interface ImportRow {
  product: ParsedProduct
  horsepower: number | null // 모델명에서 유도(실외기). 실내기 업로드면 null
  verdict: ImportVerdict
  reason?: string // ERROR/DUPLICATE 사유 (미리보기 표시용)
}

// Figma 「검증 요약」 타일과 1:1.
export interface ImportPreview {
  rows: readonly ImportRow[]
  total: number // 시트에서 감지한 모델 수
  ok: number // 등록 대상
  error: number // 스킵
  duplicate: number // 스킵(이미 등록된 모델명)
}

export interface ClassifyOptions {
  isOutdoor: boolean // 실외기 시리즈로 업로드하면 HP를 모델명에서 유도하고, 없으면 오류
  existingModelCodes: readonly string[] // 마스터에 이미 있는 모델명(전 상태)
}

// 등록 대상만 살리고 나머지는 사유와 함께 스킵으로 분류한다.
// 불변식: 모델명 필수 · 용량(냉방|난방) 최소 1개 · 실외기는 HP 유도 가능 · 파일 내/마스터 중복 금지.
export function classifyImport(products: readonly ParsedProduct[], opts: ClassifyOptions): ImportPreview {
  const existing = new Set(opts.existingModelCodes.map((c) => c.trim().toUpperCase()))
  const seenInFile = new Set<string>()
  const rows: ImportRow[] = []

  for (const product of products) {
    const key = product.modelCode.trim().toUpperCase()
    const horsepower = opts.isOutdoor ? horsepowerFromModelCode(product.modelCode) : null

    let verdict: ImportVerdict = 'OK'
    let reason: string | undefined

    if (key === '') {
      verdict = 'ERROR'
      reason = '모델명이 비어 있습니다'
    } else if (product.coolingW === null && product.heatingW === null) {
      verdict = 'ERROR'
      reason = '냉방·난방 용량을 모두 읽지 못했습니다'
    } else if (opts.isOutdoor && horsepower === null) {
      verdict = 'ERROR'
      reason = `모델명에서 마력(HP)을 유도할 수 없습니다: ${product.modelCode}`
    } else if (existing.has(key)) {
      verdict = 'DUPLICATE'
      reason = '이미 등록된 모델명입니다'
    } else if (seenInFile.has(key)) {
      verdict = 'DUPLICATE'
      reason = '같은 파일 안에서 중복된 모델명입니다'
    }

    if (verdict !== 'ERROR' && key !== '') seenInFile.add(key)
    rows.push({ product, horsepower, verdict, reason })
  }

  const count = (v: ImportVerdict) => rows.filter((r) => r.verdict === v).length
  return { rows, total: rows.length, ok: count('OK'), error: count('ERROR'), duplicate: count('DUPLICATE') }
}

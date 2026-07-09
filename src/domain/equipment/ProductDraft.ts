// 제품 등록/수정 입력 값객체 — 불변·자기검증(DDD §5.2).
// 저장소(SQLite)나 UI가 아니라 도메인이 유효성을 강제한다. 순수 도메인 — 프레임워크 무지.

import { EquipmentDomainError } from './errors'

// 등록 입력. 게시 상태는 받지 않는다 — 신규 제품은 항상 DRAFT로 태어난다.
export interface ProductDraft {
  seriesCode: string // 4단 분류의 시리즈 코드 (예: 'S_IN_4WAY', 'S_OUT_GHP')
  modelCode: string // 모델명 (고유)
  equipmentCode: string | null // 장비번호 단축코드 (실내기 '40C')
  horsepower: number | null // 마력(HP) — 실외기
  coolingW: number | null // 정격냉방능력(W)
  heatingW: number | null // 정격난방능력(W). null = 냉방전용
  maxConnections: number | null // 최대 연결 실내기 수 — 실외기
}

// 수정 입력. 지정한 필드만 덮어쓴다(미지정 = 유지).
export type ProductPatch = Partial<ProductDraft>

const MODEL_CODE_MAX = 60

const fail = (message: string): never => {
  throw new EquipmentDomainError('INVALID_FIELD', message)
}

const isFinite_ = (v: number): boolean => Number.isFinite(v)

// 비어 있지 않은 문자열
function assertText(v: string, label: string, max = MODEL_CODE_MAX): void {
  if (typeof v !== 'string' || v.trim() === '') fail(`${label}은(는) 필수입니다`)
  if (v.trim().length > max) fail(`${label}은(는) ${max}자를 넘을 수 없습니다`)
}

// null 허용 · 0 이상 유한수 (용량)
function assertNonNegative(v: number | null, label: string): void {
  if (v === null) return
  if (!isFinite_(v) || v < 0) fail(`${label}은(는) 0 이상의 수여야 합니다`)
}

// null 허용 · 0 초과 유한수 (마력)
function assertPositive(v: number | null, label: string): void {
  if (v === null) return
  if (!isFinite_(v) || v <= 0) fail(`${label}은(는) 0보다 커야 합니다`)
}

// null 허용 · 1 이상 정수 (최대 연결수)
function assertPositiveInt(v: number | null, label: string): void {
  if (v === null) return
  if (!Number.isInteger(v) || v < 1) fail(`${label}은(는) 1 이상의 정수여야 합니다`)
}

// 냉방·난방 중 최소 하나는 있어야 한다(스펙 없는 껍데기 제품 방지).
function assertHasCapacity(coolingW: number | null, heatingW: number | null): void {
  if (coolingW === null && heatingW === null) fail('냉방 또는 난방 용량 중 하나는 입력해야 합니다')
}

export function assertValidDraft(d: ProductDraft): void {
  assertText(d.seriesCode, '시리즈')
  assertText(d.modelCode, '모델명')
  if (d.equipmentCode !== null) assertText(d.equipmentCode, '장비번호', 20)
  assertNonNegative(d.coolingW, '냉방 용량')
  assertNonNegative(d.heatingW, '난방 용량')
  assertPositive(d.horsepower, '마력')
  assertPositiveInt(d.maxConnections, '최대 연결 실내기 수')
  assertHasCapacity(d.coolingW, d.heatingW)
}

export function assertValidPatch(p: ProductPatch): void {
  if (p.seriesCode !== undefined) assertText(p.seriesCode, '시리즈')
  if (p.modelCode !== undefined) assertText(p.modelCode, '모델명')
  if (p.equipmentCode !== undefined && p.equipmentCode !== null) assertText(p.equipmentCode, '장비번호', 20)
  if (p.coolingW !== undefined) assertNonNegative(p.coolingW, '냉방 용량')
  if (p.heatingW !== undefined) assertNonNegative(p.heatingW, '난방 용량')
  if (p.horsepower !== undefined) assertPositive(p.horsepower, '마력')
  if (p.maxConnections !== undefined) assertPositiveInt(p.maxConnections, '최대 연결 실내기 수')
  // 두 용량을 동시에 비우는 패치만 막는다. 한쪽만 비우는 경우는 저장소가 병합 후 재검증한다.
  if (p.coolingW === null && p.heatingW === null) assertHasCapacity(null, null)
}


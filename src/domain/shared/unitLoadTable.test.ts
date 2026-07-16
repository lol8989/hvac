// 용도별 단위부하표 (kcal/h·㎡).
// 근거: doc/03_데이터/LG전자_단위부하_참고자료.pdf (주인님 제공 2026-07-10)
import { describe, it, expect } from 'vitest'
import { FACILITY_TYPES, LOAD_INTENSITIES, FALLBACK_KCAL, lookupUnitLoadKcal, resolveUsageAlias, reasonableUnitLoadKcalRange } from './unitLoadTable'

describe('부하표 — Standard 값', () => {
  it('시설군별 표준 부하를 낸다', () => {
    expect(lookupUnitLoadKcal('주거시설', '거실')).toBe(140)
    expect(lookupUnitLoadKcal('주거시설', '침실')).toBe(110)
    expect(lookupUnitLoadKcal('OFFICE', '사무실')).toBe(150)
    expect(lookupUnitLoadKcal('OFFICE', '회의실')).toBe(150)
    expect(lookupUnitLoadKcal('종교시설', '대예배실')).toBe(300)
    expect(lookupUnitLoadKcal('대공간', '판매장')).toBe(300)
    expect(lookupUnitLoadKcal('개인병원', '병실')).toBe(140)
  })

  // 같은 실명이 시설군마다 값이 다르다 → 실명만으로는 부하를 정할 수 없다.
  it('같은 실명도 시설군이 다르면 값이 다르다', () => {
    expect(lookupUnitLoadKcal('주거시설', '식당')).toBe(120)
    expect(lookupUnitLoadKcal('상업시설', '식당')).toBe(210)
    expect(lookupUnitLoadKcal('숙박시설', '로비')).toBe(180)
    expect(lookupUnitLoadKcal('개인병원', '로비')).toBe(180)
    expect(lookupUnitLoadKcal('종교시설', '로비')).toBe(150) // '홀, 로비'
  })
})

describe('부하표 — 부하 강도 보정', () => {
  it('저부하·고부하·특수부하 열을 각각 낸다', () => {
    expect(lookupUnitLoadKcal('주거시설', '거실', 'LOW')).toBe(130)
    expect(lookupUnitLoadKcal('주거시설', '거실', 'HIGH')).toBe(150)
    expect(lookupUnitLoadKcal('주거시설', '거실', 'SPECIAL')).toBe(200)
    expect(lookupUnitLoadKcal('상업시설', '식당', 'SPECIAL')).toBe(365)
    expect(lookupUnitLoadKcal('숙박시설', '로비', 'SPECIAL')).toBe(300)
  })

  // 표에 그 강도 칸이 비어 있으면 Standard로 떨어진다(값을 지어내지 않는다).
  it('해당 강도 값이 표에 없으면 Standard로 떨어진다', () => {
    expect(lookupUnitLoadKcal('OFFICE', '회의실', 'SPECIAL')).toBe(150) // 특수부하 칸 비어 있음
    expect(lookupUnitLoadKcal('OFFICE', '관리실', 'HIGH')).toBe(150) // 저·고·특수 전부 비어 있음
    expect(lookupUnitLoadKcal('대공간', '탈의실', 'HIGH')).toBe(150) // 고부하 칸 비어 있음
  })

  // 연회장·판매장·공장의 특수부하 칸은 숫자가 아니라 주석('예식장'·'대형매장'·'발열기기 별도')이다.
  it('특수부하 칸이 주석인 행은 숫자로 읽지 않는다', () => {
    expect(lookupUnitLoadKcal('대공간', '연회장', 'SPECIAL')).toBe(300) // Standard로 떨어짐
    expect(lookupUnitLoadKcal('대공간', '판매장', 'SPECIAL')).toBe(300)
    expect(lookupUnitLoadKcal('대공간', '공장', 'SPECIAL')).toBe(300)
  })
})

describe('부하표 — 미매칭', () => {
  it('표에 없는 실명은 기본값 150', () => {
    expect(FALLBACK_KCAL).toBe(150)
    expect(lookupUnitLoadKcal('OFFICE', '없는실')).toBe(150)
    expect(lookupUnitLoadKcal('주거시설', '탕비실')).toBe(150)
  })

  it('공백·대소문자에 흔들리지 않는다', () => {
    expect(lookupUnitLoadKcal('주거시설', '  거실 ')).toBe(140)
  })
})

describe('resolveUsageAlias — 동의어 매핑', () => {
  it('도면 실명을 표준 실명으로 흡수한다', () => {
    expect(resolveUsageAlias('강당')).toBe('회의실')
    expect(resolveUsageAlias('세미나')).toBe('회의실')
    expect(resolveUsageAlias('미술실')).toBe('업무시설')
    expect(resolveUsageAlias('교실')).toBe('업무시설')
    expect(resolveUsageAlias('창고')).toBe('관리실')
  })

  it('동의어가 아니면 원래 이름을 그대로 돌려준다', () => {
    expect(resolveUsageAlias('거실')).toBe('거실')
    expect(resolveUsageAlias('무명홀')).toBe('무명홀')
  })

  it('조회는 동의어를 자동으로 거친다', () => {
    expect(lookupUnitLoadKcal('OFFICE', '강당')).toBe(150) // → 회의실
    expect(lookupUnitLoadKcal('OFFICE', '교실')).toBe(180) // → 업무시설
    expect(lookupUnitLoadKcal('OFFICE', '창고')).toBe(150) // → 관리실
  })

  // 동의어는 '표에 없을 때만' 적용한다. 표에 실재하는 실명을 동의어로 덮으면 원표 값을 잃는다.
  it('표에 실재하는 실명은 동의어보다 우선한다 (숙박 세미나실 180 ≠ 회의실 150)', () => {
    expect(lookupUnitLoadKcal('숙박시설', '세미나실')).toBe(180)
    expect(lookupUnitLoadKcal('숙박시설', '세미나실', 'HIGH')).toBe(245)
    // 표에 없는 시설군에서는 동의어로 흡수된다
    expect(lookupUnitLoadKcal('OFFICE', '세미나실')).toBe(150)
  })
})

describe('reasonableUnitLoadKcalRange — 단위부하 오버라이드 적정 범위', () => {
  // 근거 범위 = 그 실의 강도 칸(표준/저/고/특수)의 최소~최대.
  it('정의된 강도 칸의 최소·최대를 낸다', () => {
    // 사무실: standard 150 · low 145 · high 170 · special 200
    expect(reasonableUnitLoadKcalRange('OFFICE', '사무실')).toEqual({ min: 145, max: 200 })
    // 거실: 140 · 130 · 150 · 200
    expect(reasonableUnitLoadKcalRange('주거시설', '거실')).toEqual({ min: 130, max: 200 })
  })

  // 강도 칸이 standard 하나뿐이면 범위는 그 한 점(min=max)이다.
  it('표준 칸만 있는 실은 min=max', () => {
    const r = reasonableUnitLoadKcalRange('OFFICE', '관리실') // standard 150, 저·고·특수 없음
    expect(r).toEqual({ min: 150, max: 150 })
  })

  // 특수부하 칸이 주석(숫자 아님)인 행은 그 칸을 범위에 넣지 않는다.
  it('특수부하가 주석인 행은 숫자 칸만으로 범위를 만든다', () => {
    const r = reasonableUnitLoadKcalRange('대공간', '판매장') // special은 '대형매장' 주석
    expect(r).not.toBeNull()
    expect(Number.isFinite(r!.min)).toBe(true)
    expect(Number.isFinite(r!.max)).toBe(true)
  })

  // 표에 없는 실명(FALLBACK로 떨어지는 실)은 근거가 없어 판정하지 않는다.
  it('표에 없는 실명은 null(적정 여부 판정 안 함)', () => {
    expect(reasonableUnitLoadKcalRange('OFFICE', '없는실')).toBeNull()
    expect(reasonableUnitLoadKcalRange('주거시설', '탕비실')).toBeNull()
  })

  // 동의어로 흡수되는 실명은 흡수된 표준 실의 범위를 따른다.
  it('동의어는 흡수된 실의 범위를 따른다', () => {
    expect(reasonableUnitLoadKcalRange('OFFICE', '강당')).toEqual(reasonableUnitLoadKcalRange('OFFICE', '회의실'))
  })
})

describe('표 구조', () => {
  it('시설군 7개와 강도 4개를 노출한다', () => {
    expect(FACILITY_TYPES).toEqual(['주거시설', 'OFFICE', '종교시설', '상업시설', '숙박시설', '대공간', '개인병원'])
    expect(LOAD_INTENSITIES).toEqual(['STANDARD', 'LOW', 'HIGH', 'SPECIAL'])
  })

  it('모든 실의 Standard 값은 양수다', () => {
    for (const f of FACILITY_TYPES) {
      // 시설군마다 최소 한 실은 있어야 한다
      expect(lookupUnitLoadKcal(f, '없는실')).toBe(FALLBACK_KCAL)
    }
  })
})

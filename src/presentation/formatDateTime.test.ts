// 일시 표기 규칙: 목록·상세에서 등록일/수정일/게시일은 'YYYY-MM-DD HH:mm:ss'로 표기한다.
import { describe, it, expect } from 'vitest'
import { formatDateTime } from './formatDateTime'

describe('formatDateTime', () => {
  it('ISO 문자열을 YYYY-MM-DD HH:mm:ss로 표기한다', () => {
    // 타임존 표기가 없는 ISO는 로컬 시각으로 해석된다 → 어느 머신에서도 결정적.
    expect(formatDateTime('2026-07-08T09:05:03')).toBe('2026-07-08 09:05:03')
  })

  it('한 자리 월·일·시·분·초를 0으로 패딩한다', () => {
    expect(formatDateTime('2026-01-02T03:04:05')).toBe('2026-01-02 03:04:05')
  })

  it('UTC(Z) 표기는 로컬 시각으로 변환해 표기한다', () => {
    const iso = '2026-07-08T00:00:00.000Z'
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    const expected = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    expect(formatDateTime(iso)).toBe(expected)
  })

  it('null·빈값·비정상 문자열은 —로 표기한다', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('')).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})

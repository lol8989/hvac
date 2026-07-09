// 일시 표기 헬퍼 — 등록일/수정일/게시일을 'YYYY-MM-DD HH:mm:ss'(로컬 시각)로 표기한다.
// 저장은 ISO(UTC) 문자열(SQLite TEXT), 표기만 로컬로 변환. 비어 있거나 깨진 값은 '—'.
export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

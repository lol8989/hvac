// 권한 분기 (주인님 지시 2026-07-10: 로그인은 미구현, 권한 하드코딩으로 분기만 미리 세운다).
import { describe, it, expect } from 'vitest'
import { ROLES, canManageEquipment, isRole, type Principal } from './Permission'

const principal = (role: string): Principal => ({ role } as Principal)

describe('canManageEquipment (장비 관리자 권한)', () => {
  it('ADMIN만 장비 목록을 관리할 수 있다', () => {
    expect(canManageEquipment(principal('ADMIN'))).toBe(true)
  })

  it('일반 사용자(USER)는 관리할 수 없다', () => {
    expect(canManageEquipment(principal('USER'))).toBe(false)
  })

  // 인증이 붙기 전까지 principal이 없을 수 있다. 없으면 막는다(fail-closed).
  it('사용자를 알 수 없으면 거부한다', () => {
    expect(canManageEquipment(null)).toBe(false)
    expect(canManageEquipment(undefined)).toBe(false)
  })

  // 새 역할이 생겼는데 여기 안 적었다면 열어주면 안 된다.
  it('알 수 없는 역할은 거부한다', () => {
    expect(canManageEquipment(principal('SUPERUSER'))).toBe(false)
    expect(canManageEquipment(principal('admin'))).toBe(false) // 대소문자 구분
  })
})

describe('isRole', () => {
  it('허용된 역할만 통과시킨다', () => {
    expect(ROLES).toEqual(['ADMIN', 'USER'])
    expect(isRole('ADMIN')).toBe(true)
    expect(isRole('USER')).toBe(true)
    expect(isRole('GUEST')).toBe(false)
    expect(isRole(null)).toBe(false)
  })
})

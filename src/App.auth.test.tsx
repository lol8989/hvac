/** @vitest-environment jsdom */
// GNB의 '관리자' 메뉴는 권한자에게만 보인다 (주인님 지시 2026-07-10).
// 진입 경로 차단은 main.tsx 라우팅 + ForbiddenPage가 담당한다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const currentUser = { team: '영업1팀', name: '홍길동', email: 'hong@lg.com', role: 'ADMIN' as 'ADMIN' | 'USER' }

vi.mock('./data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./data')>()
  return { ...actual, get CURRENT_USER() { return currentUser } }
})

const { default: App } = await import('./App')

beforeEach(() => {
  currentUser.role = 'ADMIN'
})

const adminLink = () => screen.queryByRole('link', { name: '관리자' })

describe('GNB 관리자 메뉴 권한 분기', () => {
  it('ADMIN에게는 관리자 메뉴가 보인다', () => {
    render(<App />)
    expect(adminLink()).toHaveAttribute('href', '?view=equipment')
  })

  it('일반 사용자(USER)에게는 관리자 메뉴가 보이지 않는다', () => {
    currentUser.role = 'USER'
    render(<App />)
    expect(adminLink()).toBeNull()
  })
})

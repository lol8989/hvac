/** @vitest-environment jsdom */
// 관리자 셸 — GNB 메뉴명은 '관리자', 관리 기능은 좌측 사이드 메뉴로 진입한다 (주인님 지시 2026-07-10).
// 브레드크럼은 그 경로(홈 → 관리자 → 현재 기능)를 되비추고, 페이지 주 액션은 헤더 우측에 둔다.
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AdminShell from './AdminShell'

const renderShell = () =>
  render(
    <AdminShell active="products" description="게시된 모델만 노출됩니다." actions={<button>＋ 제품 등록</button>}>
      <div>본문</div>
    </AdminShell>,
  )

describe('AdminShell', () => {
  it('GNB에 장비마스터가 아니라 관리자 메뉴를 노출하고 활성 표시한다', () => {
    renderShell()
    const gnb = screen.getByRole('navigation', { name: '주 메뉴' })
    expect(within(gnb).getByRole('link', { name: '관리자' })).toHaveClass('on')
    expect(within(gnb).queryByRole('link', { name: '장비마스터' })).toBeNull()
  })

  it('좌측 사이드 메뉴에 장비 목록관리를 노출하고 활성 표시한다', () => {
    renderShell()
    const side = screen.getByRole('navigation', { name: '관리자 메뉴' })
    const item = within(side).getByRole('link', { name: '장비 목록관리' })
    expect(item).toHaveAttribute('href', '?view=equipment')
    expect(item).toHaveAttribute('aria-current', 'page')
  })

  it('브레드크럼이 홈 → 관리자 → 현재 기능 순서를 보여준다', () => {
    renderShell()
    const crumbs = screen.getByRole('navigation', { name: '브레드크럼' })
    expect(within(crumbs).getByRole('link', { name: '홈' })).toHaveAttribute('href', './')
    expect(within(crumbs).getByRole('link', { name: '관리자' })).toHaveAttribute('href', '?view=equipment')
    // 현재 위치는 링크가 아니다.
    const here = within(crumbs).getByText('장비 목록관리')
    expect(here).toHaveAttribute('aria-current', 'page')
    expect(here.tagName).not.toBe('A')
  })

  it('페이지 헤더에 타이틀·설명·주 액션을 렌더한다', () => {
    renderShell()
    expect(screen.getByRole('heading', { name: '장비 목록관리' })).toBeInTheDocument()
    expect(screen.getByText('게시된 모델만 노출됩니다.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '＋ 제품 등록' })).toBeInTheDocument()
    expect(screen.getByText('본문')).toBeInTheDocument()
  })
})

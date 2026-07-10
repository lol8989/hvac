/** @vitest-environment jsdom */
// 관리자 셸 — GNB 메뉴명은 '관리자', 관리 기능은 좌측 사이드 메뉴로 진입한다 (주인님 지시 2026-07-10).
import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import AdminShell from './AdminShell'

const renderShell = () =>
  render(
    <AdminShell active="products" title="장비 목록관리" badge={<span>게시 1</span>}>
      <div>본문</div>
    </AdminShell>,
  )

describe('AdminShell', () => {
  it('GNB에 장비마스터가 아니라 관리자 메뉴를 노출하고 활성 표시한다', () => {
    renderShell()
    const gnb = screen.getByRole('navigation', { name: '주 메뉴' })
    const admin = within(gnb).getByRole('link', { name: '관리자' })
    expect(admin).toHaveClass('on')
    expect(within(gnb).queryByRole('link', { name: '장비마스터' })).toBeNull()
  })

  it('좌측 사이드 메뉴에 장비 목록관리를 노출하고 활성 표시한다', () => {
    renderShell()
    const side = screen.getByRole('navigation', { name: '관리자 메뉴' })
    const item = within(side).getByRole('link', { name: '장비 목록관리' })
    expect(item).toHaveAttribute('href', '?view=equipment')
    expect(item).toHaveAttribute('aria-current', 'page')
  })

  it('타이틀·뱃지·본문을 그대로 렌더한다', () => {
    renderShell()
    // 사이드 메뉴 항목과 서브 헤더 타이틀에 같은 이름이 쓰인다 → 타이틀만 좁혀 확인한다.
    expect(screen.getByText('장비 목록관리', { selector: '.title' })).toBeInTheDocument()
    expect(screen.getByText('게시 1')).toBeInTheDocument()
    expect(screen.getByText('본문')).toBeInTheDocument()
  })
})

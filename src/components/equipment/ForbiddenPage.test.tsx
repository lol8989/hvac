/** @vitest-environment jsdom */
// 권한 없는 접근 안내 — 메뉴를 숨기는 것만으로는 URL 직접 입력을 막지 못한다.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ForbiddenPage from './ForbiddenPage'

describe('ForbiddenPage', () => {
  it('무엇이 막혔는지·누구인지·어떻게 하면 되는지를 말한다', () => {
    render(<ForbiddenPage userName="홍길동" />)
    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '장비 목록관리 권한이 없습니다' })).toBeInTheDocument()
    expect(screen.getByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText(/장비마스터 담당자에게 요청/)).toBeInTheDocument()
  })

  it('생성 작업으로 돌아가는 길을 준다', () => {
    render(<ForbiddenPage userName="홍길동" />)
    expect(screen.getByRole('link', { name: '생성 작업으로 돌아가기' })).toHaveAttribute('href', './')
  })

  it('관리 화면의 어떤 데이터도 노출하지 않는다', () => {
    render(<ForbiddenPage userName="홍길동" />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '관리자 메뉴' })).toBeNull()
  })
})

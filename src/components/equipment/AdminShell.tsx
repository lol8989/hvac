// 관리자 셸 — GNB + 좌측 사이드 메뉴 + 본문 슬롯. 레이아웃과 네비게이션만 책임진다(SRP).
//
// GNB의 '관리자'가 관리 영역 전체의 입구이고, 개별 관리 기능은 좌측 사이드 메뉴로 진입한다
// (주인님 지시 2026-07-10). 관리 기능이 늘면 ADMIN_MENUS에만 추가한다.

import type { ReactNode } from 'react'
import { CURRENT_USER, GNB_MENUS } from '../../data'

export type AdminMenuKey = 'products'

interface AdminMenu {
  key: AdminMenuKey
  label: string
  href: string
}

const ADMIN_MENUS: readonly AdminMenu[] = [{ key: 'products', label: '장비 목록관리', href: '?view=equipment' }]

interface AdminShellProps {
  active: AdminMenuKey
  title: string
  badge?: ReactNode // 서브 헤더 우측 요약(건수 등)
  children: ReactNode
}

export default function AdminShell({ active, title, badge, children }: AdminShellProps) {
  return (
    // adm-root: LG 디자인 시스템 적용 스코프. 생성·검도 화면은 무채색을 유지한다.
    <div className="app adm-root">
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
          <nav aria-label="주 메뉴">
            {/* 대시보드·검도는 POC 미구현 스텁이다. '생성'만 실제 앱으로 되돌아간다. */}
            {GNB_MENUS.map((m) => (
              <a key={m} href={m === '생성' ? './' : '#'}>
                {m}
              </a>
            ))}
            <a href="?view=equipment" className="on">
              관리자
            </a>
          </nav>
        </div>
        <div className="r">
          <span>
            {CURRENT_USER.team} / {CURRENT_USER.name}
          </span>
          <a href="./">← 생성으로</a>
        </div>
      </div>

      <div className="adm">
        <aside className="adm-side">
          <div className="adm-side-h">관리자</div>
          <nav aria-label="관리자 메뉴">
            {ADMIN_MENUS.map((m) => (
              <a key={m.key} href={m.href} className={m.key === active ? 'on' : undefined} aria-current={m.key === active ? 'page' : undefined}>
                {m.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="adm-main">
          <div className="sub">
            <div className="title">{title}</div>
            {badge && <span className="b">{badge}</span>}
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

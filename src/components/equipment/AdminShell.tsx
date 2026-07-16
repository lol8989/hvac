// 관리자 셸 — GNB + 좌측 사이드 메뉴 + 브레드크럼/페이지 헤더 + 본문 슬롯.
// 레이아웃과 네비게이션만 책임진다(SRP).
//
// GNB의 '관리자'가 관리 영역 전체의 입구이고, 개별 관리 기능은 좌측 사이드 메뉴로 진입한다.
// 브레드크럼은 그 경로(홈 → 관리자 → 현재 기능)를 그대로 되비춘다.
// 페이지 주 액션(등록·업로드)은 헤더 우측에 둔다 — 탐색 툴바와 섞지 않는다.
// (주인님 지시 2026-07-10)

import type { ReactNode } from 'react'
import { CURRENT_USER, GNB_MENUS } from '../../data'

export type AdminMenuKey = 'products' | 'combo' | 'compat'

interface AdminMenu {
  key: AdminMenuKey
  label: string
  href: string
}

const ADMIN_MENUS: readonly AdminMenu[] = [
  { key: 'products', label: '장비 목록관리', href: '?view=equipment' },
  { key: 'combo', label: '조합비 정책', href: '?view=combo' },
  { key: 'compat', label: '실내·외기 조합관리', href: '?view=compat' },
]

const HOME_HREF = './'

interface AdminShellProps {
  active: AdminMenuKey
  actions?: ReactNode // 페이지 주 액션(등록·업로드)
  children: ReactNode
}

export default function AdminShell({ active, actions, children }: AdminShellProps) {
  const current = ADMIN_MENUS.find((m) => m.key === active)!
  const adminHome = ADMIN_MENUS[0].href // 브레드크럼의 '관리자'는 관리 영역의 첫 화면으로 간다

  return (
    // adm-root: LG 디자인 시스템 적용 스코프. 생성·검도 화면은 무채색을 유지한다.
    <div className="app adm-root">
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
          <nav aria-label="주 메뉴">
            {/* 대시보드·검도는 POC 미구현 스텁이다. '생성'만 실제 앱으로 되돌아간다. */}
            {GNB_MENUS.map((m) => (
              <a key={m} href={m === '생성' ? HOME_HREF : '#'}>
                {m}
              </a>
            ))}
            <a href={adminHome} className="on">
              관리자
            </a>
          </nav>
        </div>
        <div className="r">
          <span>
            {CURRENT_USER.team} / {CURRENT_USER.name}
          </span>
          <a href={HOME_HREF}>← 생성으로</a>
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
          <header className="adm-head">
            <nav className="crumbs" aria-label="브레드크럼">
              <a href={HOME_HREF}>홈</a>
              <span className="sep" aria-hidden="true">
                /
              </span>
              <a href={adminHome}>관리자</a>
              <span className="sep" aria-hidden="true">
                /
              </span>
              <span aria-current="page">{current.label}</span>
            </nav>

            <div className="adm-head-row">
              <div className="adm-head-text">
                <h1 className="title">{current.label}</h1>
              </div>
              {actions && <div className="adm-head-actions">{actions}</div>}
            </div>
          </header>

          {children}
        </main>
      </div>
    </div>
  )
}

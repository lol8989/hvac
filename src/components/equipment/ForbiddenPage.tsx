// 권한 없는 접근 안내 (403). 메뉴를 숨기는 것만으로는 URL 직접 입력을 막지 못한다.
//
// 무엇이 잘못됐고 어떻게 하면 되는지를 말한다. 사과하지 않고, 모호하게 굴지 않는다.
// 실서비스에서는 서버가 먼저 거부한다 — 이 화면은 그 응답을 사용자에게 옮기는 자리다.

export default function ForbiddenPage({ userName }: { userName: string }) {
  return (
    <div className="app adm-root">
      <div className="gnb">
        <div className="l">
          <span className="logo">LG 전자 HVAC 포털</span>
        </div>
        <div className="r">
          <a href="./">← 생성으로</a>
        </div>
      </div>

      <main className="forbidden" role="main">
        <div className="forbidden-card">
          <p className="forbidden-code">403</p>
          <h1 className="forbidden-title">장비 목록관리 권한이 없습니다</h1>
          <p className="forbidden-desc">
            이 페이지는 장비 관리자만 열 수 있습니다. 현재 <b>{userName}</b> 님의 계정에는 관리자 권한이 없습니다.
            <br />
            권한이 필요하면 장비마스터 담당자에게 요청하세요.
          </p>
          <a className="btn primary" href="./">
            생성 작업으로 돌아가기
          </a>
        </div>
      </main>
    </div>
  )
}

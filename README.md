# HVAC POC — 장비마스터 · 생성 작업

LG전자 HVAC 도면 시스템 프로토타입. React(Vite) + 브라우저 내장 SQLite(sql.js + IndexedDB).

구현 지침은 [`CLAUDE.md`](CLAUDE.md), 다음 할 일은 [`doc/NEXT.md`](doc/NEXT.md)를 본다.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest 1회
npm run seed:build   # LG 스펙시트 → public/equipment-seed.json 재생성
```

## 화면

| URL | 화면 | 접근 |
|-----|------|------|
| `/` | 생성 작업 (방 검출 → 배치 → 조합 → 산출물) | 전체 |
| `/?view=equipment` | 장비 목록관리 (등록·수정·게시·업로드) | **ADMIN만** |
| `/?view=selection` | 장비선정표 (별도 창) | 전체 |

## 구조 (Clean Architecture)

```
src/
  domain/          # 엔티티·값객체·규칙. 프레임워크 무지
    auth/          #   권한 규칙 (Role, Principal, canManageEquipment)
    equipment/     #   장비마스터 (PublishStatus, Publishability, ModelCode, HpSource)
    generation/    #   생성 (Room, Placement, SelectionTable, IndoorModel)
    shared/        #   공유 커널 (Capacity, ComboRatio, EnergySource, Horsepower)
  application/     # 유즈케이스 + 포트(인터페이스)
  infrastructure/  # 어댑터 — SQLite 저장소, 스펙시트 파서
  presentation/    # 뷰모델·정렬·CSV
  components/      # React 컴포넌트
  styles/          # LG 디자인 시스템 (tokens.css, admin.css)
```

---

# 권한(인가) — 서버 구현 시 적용 방법

> 현재 상태: **로그인 미구현.** `src/data.ts`의 `CURRENT_USER.role`을 하드코딩해 분기만 세워 뒀다.
> 설계 근거: [`CLAUDE.md` §8.1](CLAUDE.md)

## 0. 가장 중요한 전제

**지금의 권한 검사는 보안 경계가 아니다.** 브라우저에서 돌아가는 코드는 사용자가 고칠 수 있다.
DevTools로 `canManageEquipment`가 `true`를 반환하게 만들면 관리 화면이 열린다.

서버가 붙으면 **서버가 진실**이고, 클라이언트 게이트는 그 결정을 화면에 옮기는 UX 장치로만 남는다.
클라이언트 게이트를 지우지는 않는다 — 보이지 않아야 할 메뉴가 보이는 것도 결함이다.

```
[클라이언트 게이트]  없는 메뉴를 숨긴다        → UX
[서버 인가]          없는 권한을 거부한다      → 보안   ← 이게 진짜 관문
```

## 1. 현재 코드의 어디를 바꾸는가

권한 **규칙**은 이미 도메인에 있다. 서버가 붙을 때 바뀌는 것은 **주체(Principal)의 출처**뿐이다.

| 파일 | 지금 | 서버 구현 후 |
|------|------|-------------|
| `src/domain/auth/Permission.ts` | `Role`, `Principal`, `canManageEquipment` | **그대로.** 서버와 공유하거나 같은 규칙을 서버에 복제 |
| `src/data.ts` `CURRENT_USER` | 하드코딩 상수 | 세션/토큰에서 만든 `Principal` (`GET /api/me`) |
| `src/App.tsx` GNB | `canManageEquipment(CURRENT_USER)` | **그대로.** 주입되는 값만 달라짐 |
| `src/main.tsx` 라우팅 | 권한 없으면 `ForbiddenPage` | **그대로.** + 401(미인증)이면 로그인 리다이렉트 |
| `src/infrastructure/equipment/sqlite/*` | 브라우저 SQLite 직접 접근 | HTTP 클라이언트로 교체 (포트는 그대로) |

`EquipmentAdminRepository`(포트)의 구현만 갈아끼우면 되도록 이미 분리돼 있다. 도메인·화면은 손대지 않는다.

## 2. 인증 (Authentication) — 누구인가

1. 로그인 → 서버가 세션 쿠키(`HttpOnly`, `Secure`, `SameSite=Lax`) 발급. **토큰을 `localStorage`에 두지 않는다**(XSS로 탈취된다).
2. 앱 부팅 시 `GET /api/me` → `{ id, name, team, role }`.
3. 그 응답으로 `Principal`을 만들어 컴포지션 루트(`main.tsx`)에서 주입한다.
4. 응답이 401이면 로그인 페이지로 리다이렉트한다(권한 없음(403)과 구분).

```ts
// main.tsx (예시)
const me = await fetchMe()              // 401 → 로그인 리다이렉트
if (view === 'equipment' && !canManageEquipment(me)) {
  render(<ForbiddenPage userName={me.name} />)   // 저장소를 열지 않는다
}
```

**클라이언트가 role을 서버로 보내지 않는다.** 역할은 서버가 세션에서 읽는다.
요청 본문이나 헤더에 실린 `role`은 사용자가 조작할 수 있는 값이다.

## 3. 인가 (Authorization) — 서버에서 막는다

관리 API는 **모든 엔드포인트**에서 역할을 검사한다. 미들웨어 한 곳에 몰아넣고, 라우터가 그것을 반드시 거치게 한다.

| 현재 포트 메서드 | 예상 엔드포인트 | 최소 권한 |
|-----------------|----------------|----------|
| `listProducts()` | `GET /api/admin/products` | ADMIN |
| `listSeries()` | `GET /api/admin/series` | ADMIN |
| `createProduct()` | `POST /api/admin/products` | ADMIN |
| `updateProduct()` | `PATCH /api/admin/products/:id` | ADMIN |
| `setStatus()` | `POST /api/admin/products/:id/status` | ADMIN |
| `setStatusMany()` | `POST /api/admin/products/status:bulk` | ADMIN |
| `importProducts()` | `POST /api/admin/products:import` | ADMIN |
| (생성·검도가 쓰는 조회) | `GET /api/catalog/*` | 전체 (**PUBLISHED만**) |

주의: `listProducts()`는 **DRAFT·ARCHIVED를 포함한 전 상태**를 돌려준다. 이 응답이 일반 사용자에게 새면
게시하지 않은 모델·단종 예정 모델이 노출된다. 생성·검도용 조회(`/api/catalog/*`)와 **엔드포인트를 분리**하고,
후자는 서버에서 `status = 'PUBLISHED'`를 강제한다(지금의 `v_published_products` 뷰와 같은 역할).

## 4. 서버가 반드시 다시 검증해야 하는 것

클라이언트가 이미 검사했더라도 서버가 다시 한다. 클라이언트 검사는 사용자에게 빨리 알려주기 위한 것일 뿐이다.

- **게시 전제조건** (`domain/equipment/Publishability.ts`) — 냉방용량·마력·(VRF면) 최대 연결 실내기 수.
  이 규칙을 서버에 복제하거나, 도메인 패키지를 서버와 공유한다. 클라이언트를 우회한 `POST .../status`가
  요건 미달 모델을 게시하면 생성·검도가 값객체를 만들다 터진다.
- **상태 전이** (`domain/equipment/PublishStatus.ts`) — 허용된 전이(선형 + 재게시)만.
- **게시본 스펙 잠금** — `PUBLISHED` 제품의 스펙 수정 거부(`SPEC_LOCKED`).
- **업로드 파일** — 확장자·크기·행 수 상한. 파서를 서버에서 다시 돌린다(클라이언트 파싱 결과를 믿지 않는다).

## 5. 응답 규약

| 상황 | 상태 코드 | 클라이언트 동작 |
|------|----------|----------------|
| 미인증(세션 없음·만료) | `401` | 로그인 페이지로 리다이렉트 |
| 인증됐으나 권한 없음 | `403` | `ForbiddenPage` |
| 요건 미달·전이 불가 | `422` (또는 `409`) | 사유를 토스트로 (`EquipmentDomainError.code` 매핑) |

세션 만료 팝업 → 로그인 리다이렉트 흐름은 화면설계서 규칙과 맞춘다.

## 6. 감사 로그 (Audit)

게시·단종·일괄 전이·업로드는 **누가·언제·무엇을** 남긴다. 장비마스터는 생성·검도의 SSOT라
잘못된 게시 하나가 하류 산출물 전체를 오염시킨다.

- 최소 필드: `actor_id`, `action`, `target_model_code`, `before_status`, `after_status`, `at`
- 스키마 참고: `doc/02_DB설계/01_schema_v2.sql`의 `import_jobs`, `price_change_logs`

## 7. 흔한 실수 (하지 말 것)

- ❌ 프론트에서만 막고 API는 열어 둔다 → 주소만 알면 누구나 호출한다.
- ❌ 관리 목록 API를 일반 사용자에게도 열어 두고 화면에서만 숨긴다 → 응답 본문에 DRAFT가 다 들어 있다.
- ❌ 클라이언트가 보낸 `role`을 신뢰한다 → 요청 본문은 사용자가 고친다.
- ❌ 역할을 문자열로 여기저기 비교한다(`if (user.role === 'admin')`) → 대소문자·오타로 조용히 열린다.
  `canManageEquipment()` 한 곳만 쓴다.
- ❌ 새 역할을 추가하면서 `canManageEquipment`를 안 고친다 → **fail-closed라 막힌다**(의도된 동작).
  모르는 역할은 거부하고, 열어야 한다면 규칙에 명시적으로 적는다.

## 8. 이관 체크리스트

- [ ] `GET /api/me` + 세션 쿠키. 401 → 로그인 리다이렉트
- [ ] `Principal`을 `main.tsx`에서 주입 (`CURRENT_USER` 상수 제거)
- [ ] 관리 API 전체에 ADMIN 미들웨어. 목록 API를 `/api/admin/*`와 `/api/catalog/*`로 분리
- [ ] `/api/catalog/*`는 서버에서 `PUBLISHED` 강제
- [ ] 게시 전제조건·상태 전이·스펙 잠금을 서버에서 재검증
- [ ] 업로드 파서를 서버에서 재실행 (크기·행수 상한)
- [ ] `SqliteEquipmentAdminRepository` → `HttpEquipmentAdminRepository`로 교체 (포트 계약 동일)
- [ ] 403/401/422 응답 → 화면 매핑
- [ ] 감사 로그 적재
- [ ] 적대적 QA: 권한 없는 세션으로 관리 API 전 엔드포인트 직접 호출 → 전부 403인지 확인

## 9. 테스트

권한 규칙은 도메인 단위테스트로 고정돼 있다(`src/domain/auth/Permission.test.ts`).
서버가 붙어도 이 테스트는 그대로 살아 있어야 한다.

```
canManageEquipment: ADMIN만 true · USER/null/undefined/모르는 역할은 false (fail-closed)
GNB 분기          : ADMIN에게만 '관리자' 링크 (src/App.auth.test.tsx)
403 화면          : 관리 데이터를 하나도 노출하지 않는다 (ForbiddenPage.test.tsx)
```

서버 구현 후에는 **인가 통합테스트**를 추가한다: 일반 사용자 세션으로 관리 엔드포인트를 하나씩 호출해
전부 403인지 확인한다. 엔드포인트를 새로 추가하고 미들웨어를 빠뜨리는 것이 가장 흔한 사고다.

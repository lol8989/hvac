# NEXT — 다음 작업 큐

> 세션 시작 시 이 파일부터 확인한다. 완료한 항목은 지우지 말고 `[x]` + 완료일·커밋을 남기고, 새 항목은 위에 추가한다.

## 2026-07-09 예정 (2026-07-08 주인님 지시)

- [x] **장비선정표 데이터 소스를 장비마스터 참조로 전환** (2026-07-09, 미커밋) — Equipment Master 컨텍스트 신설(`domain/equipment`: PublishStatus·MasterRecord·EquipmentMaster 포트, `infrastructure/equipment/InMemoryEquipmentMaster` = 시드 SSOT + 게시 게이트). 실내기 SEED·실외기 ODU_CATALOG를 마스터로 이관(PUBLISHED), 게이트 실증용 DRAFT/ARCHIVED 1건씩 추가. 생성 카탈로그(Indoor/Outdoor)를 마스터 참조 어댑터로 전환(기본 싱글턴 주입 → 기존 호출부 유지). App 컴포지션 루트에서 마스터 1개 주입. 마스터는 PUBLISHED만 노출(생성/검도 참조). 테스트 387개 그린.

## 2026-07-09 신규 (2026-07-09 주인님 지시)

- **장비마스터(SQLite 내장) — 구현 계획서 작성 완료** → [`doc/장비마스터_구현계획.md`](장비마스터_구현계획.md) (2026-07-09). 스택 확정: 브라우저 내장 sql.js(WASM)+IndexedDB. 입력=LG 스펙시트, 출력=선정표/일람표(hot 필드), 구조=schema_v2.sql 서브셋(4단 분류+products 정규화+product_specs JSONB+게시게이트).
  - [x] **P1. 읽기 백엔드 교체** (2026-07-09, 미커밋) — sql.js(WASM)+IndexedDB 저장소·SQLite 스키마(4단 서브셋+뷰)·정규화 시드(공유 seedData 16+7)·`SqliteEquipmentMaster`(PUBLISHED 스냅샷 materialize)로 생성단 무영향 교체. `main.tsx` 부트스트랩 주입(App `master` 옵셔널 prop, 기본 인메모리→테스트/폴백). **동치 테스트로 SQLite≡InMemory 고정**. 브라우저 실구동 검증(IndexedDB 생성·16 실내기 UI 흐름·콘솔 에러 0). 테스트 396개. 적대적 리뷰(26 에이전트) 확정 3결함 반영: ①캐시 무효화 SEED_HASH(시드 내용 해시) 키 ②부트스트랩 타임아웃 레이스+로딩 표시 ③순서/시드드리프트 테스트. 후속(P2): 옛 IndexedDB 키 고아 청소.
  - **P2. 쓰기 포트 + 관리 페이지** — 세로 슬라이스로 진행:
    - [x] **S1. 관리 목록(읽기)** (2026-07-09, 미커밋) — `EquipmentAdminRepository.listProducts`(전 상태) + SQLite 어댑터, 관리 페이지(목록/분류·상태 필터/검색/페이지네이션/상태뱃지, 무채색), `?view=equipment` 라우팅 + GNB 링크, `query.ts` 공용 헬퍼 추출. 브라우저 검증(25제품 전 상태). 적대적 리뷰(12에이전트)→접근성 aria-label 2건 반영. 테스트 405.
    - [ ] **S2. 쓰기 포트 + 등록/수정/게시** — `EquipmentAdminRepository` 쓰기(create/update/setStatus/setPrice, 상태전이 불변식) + SQLite 쓰기(IndexedDB 영속) + 등록/수정 폼·게시/보관 액션.
    - [ ] **S3. 조합비 정책 UI** — 전역+제품군별 min/max 설정(계획서 §3.5) → 생성단 전파.
  - [ ] **P3. 스펙시트 업로드 ETL** — xlsx 파서(전치형·제품군별)·라벨 정규화(`spec_label_aliases`)·`import_jobs` 미리보기/커밋/거부로그.
  - [ ] **P4. 실데이터 적재 + 산출물 확장** — 40종 스펙시트 적재, 선정표/일람표 실제 컬럼 연결.
  - [ ] **조합비 정책 UI 설정** (주인님 결정 2026-07-09) — 100% vs 0.5~1.3 상충을 하드코딩 대신 관리 UI 설정으로 해소. 전역 기본(system_settings) + 제품군별 override, `ComboRange` VO로 운반, 생성단 경고선 즉시 전파(계획서 §3.5). P2(관리 페이지)에 포함.
  - ⚠️ 남은 확인(계획서 §8): 조합비 전역 기본 초기값(1.0 vs 1.3), P1 시드 범위, 일람표 세부필드 우선순위, 4단 분류 코드 확정, 영속 정책.
- [x] **조합 리포트 초기 상태 초기화** (2026-07-09, 미커밋) — `domainRooms`를 빈 상태로 시작 → '실 검출 실행'이 채우도록 변경(총부하가 검출 후에만 뜸). `INITIAL_GROUPS.items`/`INITIAL_POOL` 사전배정 제거. `ReportStrip` cover NaN 가드. 검출 전 전 지표 0/빈 확인 테스트 추가(`App.report.test.tsx`).
- [x] **미배정 카운트 상수 1 제거** (2026-07-09, 미커밋) — `INITIAL_POOL=[]`. 배정은 파이프라인 결과로만: 실내기 배치(`aiPlace`) 시 전 실을 미배정 풀에 편입(`ensureRoomsInPool`) → 미배정 6, combine 진입 시 `DEFAULT_COMBINATION` 자동 조합 1회 적용(`autoCombine`) → 배정 6/미배정 0, 이후 매핑 팝업에서 사용자 조정. (combine UX 방향: 주인님 선택 "자동 조합 기본값")

## 백로그 (미확정·후속)

- 조합비 제품군별 실정책 수치 확정 (현재 전부 기본 0.5~1.3 — `comboMin/Max` 구조만 마련됨)
- 실내기 난방용량 실측치 반영 (13종은 ×1.10~1.13 보간 목업), 실외기 heatKw도 ×1.12 근사
- MappingModal이 `ROOMS` 직접 import — 선정표에서 바꾼 실명이 매핑 팝업 칩에 미반영, 경고 문구 0.5~1.3 하드코딩
- 비고(remarks) 컬럼 편집, xlsx 직접 출력(현재 CSV+BOM), 다층(층 다중화) 시나리오
- 적대적 QA 패스 보강 (07-08 세션 한도로 1회 중단됨)
- 우측 패널 실내기 100+ 대량 항목 스크롤 대응
- 실 검출 정합·DXF export (딥줌 타일 뷰어 후속)

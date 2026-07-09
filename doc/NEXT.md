# NEXT — 다음 작업 큐

> 세션 시작 시 이 파일부터 확인한다. 완료한 항목은 지우지 말고 `[x]` + 완료일·커밋을 남기고, 새 항목은 위에 추가한다.

## 2026-07-09 예정 (2026-07-08 주인님 지시)

- [x] **장비선정표 데이터 소스를 장비마스터 참조로 전환** (2026-07-09, 미커밋) — Equipment Master 컨텍스트 신설(`domain/equipment`: PublishStatus·MasterRecord·EquipmentMaster 포트, `infrastructure/equipment/InMemoryEquipmentMaster` = 시드 SSOT + 게시 게이트). 실내기 SEED·실외기 ODU_CATALOG를 마스터로 이관(PUBLISHED), 게이트 실증용 DRAFT/ARCHIVED 1건씩 추가. 생성 카탈로그(Indoor/Outdoor)를 마스터 참조 어댑터로 전환(기본 싱글턴 주입 → 기존 호출부 유지). App 컴포지션 루트에서 마스터 1개 주입. 마스터는 PUBLISHED만 노출(생성/검도 참조). 테스트 387개 그린.

## 2026-07-09 신규 (2026-07-09 주인님 지시)

- [ ] **장비마스터 관리 페이지 (SQLite 내장)** — 서버 구축 전이므로 내부 SQLite로 진행. 관리자용 장비마스터 CRUD 페이지(목록/상세·등록·수정/엑셀 업로드·동기화/게시·단가, DRAFT→PUBLISHED→ARCHIVED 게이트). 현재 `InMemoryEquipmentMaster`(SSOT·게시 게이트 계약)를 SQLite 리포지토리 구현으로 교체·확장. 4단 분류(대/중/시리즈/모델)+정규화 필드+JSONB 확장스펙(CLAUDE.md §4). ⚠️ 스택 선택 필요(Vite 프런트 단독 vs. 경량 백엔드+better-sqlite3, sql.js(WASM) 브라우저 내장 등) — 착수 전 확인.
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

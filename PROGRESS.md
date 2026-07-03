# 도면검도시스템 POC — 진행 기록 & 로드맵

> 작업 결과와 향후 과제(백로그·관제 항목)를 기록하는 문서. CLAUDE.md는 "규칙", 이 문서는 "상태/계획".
> 최종 갱신: 2026-07-03

---

## 1. 개요

React(Vite)+TypeScript(strict) 유저 페이지 프로토타입 — "생성 작업 · 방(실) 검출 결과" 화면.
SVG 도면 뷰어 + 우측 모델 선택 + 상단 조합 리포트 + AI 실내기 배치 + 실외기 조합 매핑 팝업.
아키텍처: Clean Architecture · DDD · TDD · 적대적 QA · Claude Hooks.

- 저장소: https://github.com/lol8989/hvac
- 품질 게이트: `npm run validate` = `tsc --noEmit && eslint . && vitest run` (Stop 훅 자동 실행)
- 현재: 테스트 **136 그린**, tsc 0, eslint 0(레이어 게이트 포함), 빌드 정상

---

## 2. 완료된 작업 (커밋 순)

| 커밋 | 내용 |
|------|------|
| `2f0fe06` | POC 초기 커밋(방 검출 화면 프로토타입) + git/원격 셋업 |
| `63e468b` | **Phase 0/1** 공유 VO(EnergySource·Capacity·ModelCode) + OutdoorGroup 애그리거트(불변식: 계열·최대수·중복) |
| `675d073` | **Phase 2** AssignmentPlan 조율자(교차 불변식) + 유즈케이스(reassign/replace/add/remove/split) + 포트·InMemory 리포지토리 |
| `e2d053e` | 도면 휠 확대 시 브라우저 스크롤 차단(native `{passive:false}` + touch-action) |
| `134d519` | **Phase 3** App→유즈케이스 스왑(planAdapter 어댑터, 동작 보존) |
| `7172776` | **TypeScript strict 전면 전환**(도메인 타입화, 판별 유니온, 포트 인터페이스) |
| `574ddce` | `.gitattributes`(LF 정규화) + ESLint(typescript-eslint type-checked) |
| `44a43ea` | `validate` 통합 스크립트·Stop 훅 강화 + dev 툴체인 업그레이드(취약점 0) |
| `dfe0df4` | CLAUDE.md §8: doc/ 자료 신뢰도 주의(애매 시 사용자 확인) |
| `2d8f5d1` | **maxConnections 스펙 주입** — 카탈로그 SSOT + OutdoorModelCatalog 읽기 포트 |
| `e49c608` | **단가(Price)·에너지등급(EnergyGrade) 확장** + 적대적 리뷰 확정 결함 수정 |

### 아키텍처 현황 (레이어)
```
domain/        shared(Capacity·ComboRatio·EnergySource·ModelCode·Price·EnergyGrade·PriceEntry)
               generation(IndoorUnit·OutdoorUnit·OutdoorGroup·AssignmentPlan·events·errors)
application/   generation(ports: PlanRepository·OutdoorModelCatalog·OutdoorModelSpec, 유즈케이스 5종)
infrastructure/generation(InMemoryPlanRepository·InMemoryOutdoorModelCatalog)
presentation/  generation(planAdapter: bootstrap·toViewModel·specText·efficiencyText)
components/    Viewer·ReportStrip·ModelPanel·MappingModal  (App.tsx 조립)
```
- 의존성 방향 게이트: eslint `no-restricted-imports`로 domain→상위, application→구현 import 자동 차단.

---

## 3. 향후 과제 / 백로그

### 3.1 완료 — 도면 뷰어 기능 이식 (사용자 확정, 커밋 `efdf96a`·`83d26ab`)
> 출처: `aircon-symbol-poc-v2.html` 분석. 대상: `src/components/Viewer.tsx`. 무채색·presentation 전용.

- [x] **커서 기준 휠 줌** — `getScreenCTM().inverse()`로 커서 아래 지점 고정, clamp 100%×1/8~×3
- [x] **정확한 팬(pan)** — CTM 스케일(a,d) 변환, window 리스너로 화면 밖 지속, `toSvg` 좌표 변환
- [x] **도면 단축키** — `Space`/`H`(팬) · `V`(선택) · `0`(맞춤) · `Esc`(선택 해제+팝업)
- [x] **실 다중선택(마퀴)** — 영역 드래그 AABB 교차 · `Shift`+클릭 토글. App `selRooms: string[]`
- [x] **플로팅 위젯** — 우상단 접이식 힌트 + 하단 중앙 Figma식 도구바(무채색)
- [x] **용어: "방" → "실"** 표기 통일
- [x] **편집 기능(증분 C, 뷰어 로컬 상태)**: 실내기(에어컨) 심볼 이동/회전(R 90°·핸들 15°)/삭제(Del)·추가,
  실(존) 모서리 리사이즈, C(에어컨)/Z(존)/H(손) 모드, 그리드 스냅. 하위 컴포넌트 분리(ACUnit·ZoneRect·geometry)
- 후속 후보: 편집 결과 **도메인 영속화**(IndoorUnit 배치 좌표/회전 유즈케이스), 실 리사이즈 → ROOMS bounds 반영,
  실 다중선택 → 다중 그룹 배정 연동, Viewer.tsx(~360줄) 상호작용 로직을 커스텀 훅으로 분리

### 3.2 단가·에너지등급 후속 (리뷰 지적 중 defer)
- [ ] **실데이터 교체** — ODU_CATALOG의 단가/등급/COP는 현재 **POC 플레이스홀더**. 장비일람표/장비선정표 기준 실값으로 교체(값 확정 시 사용자 확인 후).
- [ ] **현행가 필터(asOf)** — `topEntry`/`defaultPrice`에 기준일 파라미터로 미래 시작일 제외(다건·미래일 실데이터 연동 전). 현재는 게시뷰 현행가 가정에만 의존.
- [ ] **ModelPanel 카탈로그 완전 배선** — 우측 패널을 raw `MODELS.out` 대신 ODU_CATALOG 파생 뷰로 주입, `mp/ms` 중복 필드 제거(현재는 드리프트 정합 테스트로만 고정).
- [ ] **실내기 IndoorModelCatalog 대칭화** — 실외기(OutdoorModelCatalog)와 동일 패턴으로 실내기 스펙 포트화(`MODELS.in` 목업 대체).

### 3.3 도메인 다음 단계
- [ ] **검도(Review) 컨텍스트** — 도면-장비일람표 정합성 검증.
- [ ] **장비마스터 관리자 화면** — 목록/상세·등록/엑셀 업로드/게시(DRAFT→PUBLISHED→ARCHIVED)·단가.
- [ ] **산출물 생성** — 장비일람표(엑셀)·도면 산출.

---

## 4. 관제 / 주의 항목 (Oversight)

- ⚠️ **doc/ 자료 신뢰도** — 일부 최신화 안 됨. 문서 간/문서-코드 상충 또는 수치(단가·등급·스키마) 애매 시 **임의 추정 금지, 사용자 확인**(CLAUDE.md §8).
- ⚠️ **POC 플레이스홀더 값** — ODU_CATALOG 단가/등급/COP, maxConnections는 예시/보간값. 실데이터 아님(코드 주석에 명시).
- 🎨 **무채색 규칙** — 이식·신규 UI는 유채색 금지(회색조만). 외부 참고자료(파랑 강조)는 변환 필수.
- 🧱 **레이어 규칙** — domain은 상위 import 금지(eslint 게이트). 신규 도메인 타입은 domain에 정의.
- 🔢 **이름 규칙** — 모든 사람 이름은 "홍길동".

---

## 5. 오픈 질문 (결정 대기)

- 단가·등급 **실데이터 소스/값** 확정 (장비일람표 vs 장비선정표, 유효일자 기준).
- 검도 vs 장비마스터 중 **다음 착수 컨텍스트** 우선순위.

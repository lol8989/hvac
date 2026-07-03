# HVAC POC — 생성 작업 · 방 검출 결과 (React)

HTML 목업을 React(Vite)로 이식한 POC. 모듈 단위로 분리되어 있습니다.

## 실행

```bash
cd POC
npm install
npm run dev
```

브라우저에서 표시된 로컬 주소(기본 http://localhost:5173)를 엽니다.

## 구조

```
POC/
├─ index.html
├─ package.json
├─ vite.config.js
└─ src/
   ├─ main.jsx              # 엔트리
   ├─ App.jsx               # 상태(그룹/풀/선택/탭/모달) + 레이아웃
   ├─ data.js               # 목업 데이터(장비일람표 기반) + 헬퍼
   ├─ styles.css            # 무채색 · Noto Sans KR
   └─ components/
      ├─ ReportStrip.jsx    # 상단 조합 리포트(용량 요약 통합) + 액션 버튼
      ├─ Viewer.jsx         # 도면 뷰어(방 검출)
      ├─ ModelPanel.jsx     # 우측 실내기/실외기 모델 선택
      └─ MappingModal.jsx   # 실외기 조합 매핑 팝업(드래그)
```

## 개념

- **장비마스터**(관리자)는 등록만: 분류·스펙·단가. 제품군·계열 정보 제공.
- **유저(생성) 페이지**가 마스터를 참조해 호환·조합을 판단.
  - 상단 조합 리포트: 총 설치 용량 · 실외기 수 · 배정/커버율 · 미배정 · 평균 조합비 · 과부하 (읽기 전용)
  - AI 실내기 배치: 방에 실내기 자동 배치
  - 실외기 조합 매핑(팝업): 드래그로 실내기↔실외기 조합, 조합비/호환 경고

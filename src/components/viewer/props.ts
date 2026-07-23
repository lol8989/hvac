// 도면 뷰어의 **공개 인터페이스**(모드·레이어·프롭 계약). 렌더·상호작용과 분리해 둔다.
//
// Viewer.tsx는 "그리고 반응하는" 파일이고, 이 파일은 "무엇을 주고받는가"만 선언한다.
// 훅들(useSliceMode·useViewerDrag 등)이 Viewer.tsx를 타입 때문에 되짚어 import 하던
// 순환도 여기서 끊긴다(§5.6 — 변경 이유가 다르면 파일도 다르다).
import type { Room } from '../../data'
import type { GroupColor } from '../../presentation/generation/groupColors'
import type { UnitSym, Pt } from './geometry'
import type { ViewBox } from './usePanZoom'

export type Mode = 'cassette' | 'zone' | 'pan' | 'outdoor' | 'slice' | 'merge' // 에어컨 / 존 / 손 / 실외기 / 자르기 / 병합

// 자르기 라인(무한 직선): 지나는 점 + 각도(도). 도메인 CutLine과 같은 모양이다.
export interface SliceLine { x: number; y: number; angleDeg: number }

// 레이어 표시: 각 레이어를 독립적으로 켜고 끈다(도면 배경은 항상 표시).
// 예전엔 하나만 고르는 단일 필터('all' | 하나)였는데, 여러 레이어를 동시에 보며
// 작업하려면 레이어별 on/off가 맞다 — 그래서 레이어별 boolean 맵으로 바꿨다.
export type LayerName = 'zone' | 'indoor' | 'outdoor'
export type LayerVisibility = Record<LayerName, boolean>
export const ALL_LAYERS_ON: LayerVisibility = { zone: true, indoor: true, outdoor: true }
export const LAYER_TOGGLES: readonly { name: LayerName; label: string }[] = [
  { name: 'indoor', label: '실내기' },
  { name: 'outdoor', label: '실외기' },
  { name: 'zone', label: '실 경계' },
]

// 실외기 배치용 그룹 요약(도면 심볼 라벨·모델·마력).
// 실외기는 장비번호를 쓰지 않는다 — 도면 표기는 **마력(HP)** 이다(0708 회의록 「장비번호기입」,
// 주인님 확인 2026-07-20). 마력은 카탈로그 스펙에서 오므로 표시 계층에서 조인한다.
export interface OutdoorGroupInfo {
  key: string
  label: string
  model: string
  hp?: number
}

// 딥줌 타일 피라미드 매니페스트(tools/dxf_to_tiles.py 산출).
export interface TileLevel { z: number; pxW: number; pxH: number; cols: number; rows: number }
export interface TileManifest {
  tile: number
  levels: TileLevel[]
  masterPx: [number, number]
  worldMin: [number, number]
  worldMax: [number, number]
  units: string
}

// 실내기 심볼 이동/회전 커밋 페이로드(드래그 끝에 한 번만 올린다).
export interface UnitMove { id: string; x: number; y: number }
export interface UnitRotate { id: string; rot: number }

// 편집 히스토리 — 되돌리기 대상은 대부분 도면 편집이라 컨트롤도 캔버스에 둔다.
// 히스토리 자체(스택)는 App이 갖는다. 뷰어는 상태를 표시하고 클릭을 전달할 뿐이다.
export interface HistoryControl {
  canUndo: boolean
  canRedo: boolean
  undoLabel?: string | null // 되돌릴 편집 이름(툴팁) — 없으면 되돌릴 것이 없다
  redoLabel?: string | null
  onUndo: () => void
  onRedo: () => void
}

// App 버튼에서 호출하는 명령형 핸들.
export interface ViewerHandle {
  placeOutdoors: () => void // 그룹별 실외기 심볼을 도면 하단(건물 외부)에 배치
  captureSvg: () => string | null // 현재 도면 SVG 직렬화(캡처 다운로드용)
}

// ── 프롭 클러스터 ─────────────────────────────────────────────────────────────
// 프롭 37개를 서브시스템별로 묶는다. 묶는 축은 **변경 이유**다(§5.6):
// 실내기 편집 규칙이 바뀌면 indoor만, 도면 소스가 바뀌면 canvas만 바뀐다.

// 도면 좌표계·타일·뷰 맞춤 — "무엇을 어떤 좌표로 그리는가".
export interface CanvasProps {
  planW?: number // 도면 정규화 좌표 폭(기본 720 목업 / 실도면은 종횡비 유지 폭)
  planH?: number // 도면 정규화 좌표 높이(기본 470)
  mmPerUnit?: number // 정규화 1단위 = 실 mm (격자 실치수 표기 + DXF 왕복)
  fitBounds?: ViewBox // 층 전환: 활성 층 실들을 감싸는 bbox. 있으면 여기에 맞춘다(없으면 전체 도면)
  tiles?: TileManifest // 딥줌 타일 매니페스트(보이는 타일만 로드)
  tileBase?: string // 타일 URL 베이스(예: /tiles)
}

// 실내기(에어컨) 레이어 — 심볼 소유는 App(Placement)이고 뷰어는 편집 이벤트만 올린다.
// 심볼 하나 = 실내기 한 대 = 선정표 대수 1.
export interface IndoorProps {
  symbols: UnitSym[]
  info?: Record<string, { model: string; kind: string }> // 실별 실내기 모델명·유형(심볼 오버레이)
  canAdd?: boolean // ＋실내기 수동 추가 허용 — '실내기 배치' 단계에서만
  onMove?: (moves: UnitMove[]) => void
  onRotate?: (rots: UnitRotate[]) => void
  onDelete?: (ids: string[]) => void
  onAdd?: (roomId: string) => void // 대표 실에 1대 추가
  onAddUnavailable?: (reason: 'step' | 'noRoom') => void // ＋실내기를 못 쓰는 상황 안내(버튼은 항상 활성)
}

// 실외기 레이어 — 심볼도 App이 소유한다. 가드가 '몇 대 중 몇 대 배치됐는지' 알아야 하고,
// 그 좌표가 산출 도면에 실린다.
export interface OutdoorProps {
  symbols: UnitSym[]
  groups?: OutdoorGroupInfo[] // 실외기 배치 대상 그룹(placeOutdoors)
  canPlace?: boolean // ＋실외기 배치 허용 — '실외기 배치' 단계에서만 활성
  onMove?: (moves: UnitMove[]) => void
  onDelete?: (keys: string[]) => void
  onAutoPlace?: (positions: Record<string, { x: number; y: number }>) => void
}

// 실 자르기(V): 실내기 배치 단계에서만 허용한다(실_슬라이싱_설계_v1 §D2).
export interface SliceProps {
  enabled?: boolean
  onSlice?: (roomId: string, line: SliceLine) => void
  onUnavailable?: () => void // 허용되지 않는 단계에서 V를 눌렀을 때(App이 안내한다)
}

// 실 병합(M): 붙어 있는 두 실을 하나로. 자르기와 같은 단계에서만 쓴다.
export interface MergeProps {
  enabled?: boolean
  onMerge?: (aId: string, bId: string) => void
  isAdjacent?: (aId: string, bId: string) => boolean // 인접 판정은 도메인이 한다(뷰어는 물어본다)
  onUnavailable?: () => void
}

export interface ViewerProps {
  rooms: Record<string, Room>
  selectedIds: string[] // 선택된 실(존) id — ModelPanel 연동
  onSelectionChange: (ids: string[]) => void
  onEscape?: () => void
  onZoneResize?: (roomId: string, points: readonly Pt[]) => void // 모서리 리사이즈 커밋(형상 SSOT는 App)
  roomColors?: Record<string, GroupColor> // 실 id → 실외기 그룹 색상(방·실내기 하이라이팅). 미배정 실은 없음 → 무채색
  layers?: LayerVisibility // 레이어별 표시 여부(기본 전부 ON)
  onLayersChange?: (v: LayerVisibility) => void // 레이어 토글은 뷰어 도구다(상단 툴바 밴드 제거)
  history?: HistoryControl
  // 조합 단계: 선택된 실들 위에 뜨는 '실외기 선정' 오버레이 버튼의 동작(없으면 버튼 미표시).
  onSelectOutdoorForSelection?: () => void
  canvas?: CanvasProps
  indoor: IndoorProps
  outdoor: OutdoorProps
  slice?: SliceProps
  merge?: MergeProps
}

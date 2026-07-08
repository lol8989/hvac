// 실내기 모델 카탈로그 인메모리 어댑터 (IndoorModelCatalog 포트 구현).
// POC 시드 데이터 — 추후 장비마스터 API 클라이언트로 교체.
//
// 근거: 표준 260415 장비선정표 엑셀 Multi V Super 탭 — 20C/40C/110T 냉난방값 실측,
//       나머지 난방은 실측 비율(×1.10~1.13) 보간 목업.

import { IndoorModel } from '../../domain/generation/IndoorModel'
import type { IndoorModelCatalog } from '../../application/generation/ports'

const CASSETTE = '4WAY 카세트'
const DUCT = '덕트'

// [code, model, coolW, heatW, type] — 전부 계열 EHP.
const SEED: ReadonlyArray<[string, string, number, number, string]> = [
  // C시리즈 (4WAY 카세트)
  ['20C', 'RNW0201C2S', 2000, 2200, CASSETTE],
  ['23C', 'RNW0231C2S', 2300, 2600, CASSETTE],
  ['32C', 'RNW0321C2S', 3200, 3600, CASSETTE],
  ['40C', 'RNW0401C2S', 4000, 4500, CASSETTE],
  ['52C', 'RNW0521C2S', 5200, 5800, CASSETTE],
  ['60C', 'RNW0601C2S', 6000, 6700, CASSETTE],
  ['72C', 'RNW0721C2S', 7200, 8100, CASSETTE],
  // T시리즈 (덕트)
  ['40T', 'RNW0401A2U', 4000, 4500, DUCT],
  ['52T', 'RNW0521A2U', 5200, 5800, DUCT],
  ['60T', 'RNW0601A2U', 6000, 6700, DUCT],
  ['72T', 'RNW0721A2U', 7200, 8100, DUCT],
  ['83T', 'RNW0831A2U', 8300, 9300, DUCT],
  ['100T', 'RNW1001A2U', 10000, 11200, DUCT],
  ['110T', 'RNW1101A2U', 11000, 12400, DUCT],
  ['130T', 'RNW1301A2U', 13000, 14600, DUCT],
  ['145T', 'RNW1451A2U', 14500, 16300, DUCT],
]

export class InMemoryIndoorModelCatalog implements IndoorModelCatalog {
  private readonly models: readonly IndoorModel[]

  constructor() {
    this.models = Object.freeze(
      SEED.map(
        ([code, model, coolW, heatW, type]) =>
          new IndoorModel({ code, model, coolW, heatW, type, energySource: 'EHP' }),
      ),
    )
  }

  list(): readonly IndoorModel[] {
    return this.models
  }

  byCode(code: string): IndoorModel | null {
    return this.models.find((m) => m.code === code) ?? null
  }

  byModel(model: string): IndoorModel | null {
    return this.models.find((m) => m.model === model) ?? null
  }
}

// 딥줌 타일 매니페스트 로딩 (presentation 훅).
//
// 실제 도면은 Python(ezdxf)으로 전처리한 타일 피라미드다(public/tiles/manifest.json).
// 매니페스트의 worldMin/Max(mm)로 뷰어 좌표계를 DXF 월드좌표에 맞춘다
// — 검출·배치·export 정합의 토대다.
//
// 이 훅이 바뀌는 이유는 하나: 도면 원본을 어떻게 불러오는가(전처리 산출물 포맷·경로).

import { useEffect, useMemo, useState } from 'react'
import type { TileManifest } from '../../components/Viewer'

export interface PlanDims {
  w: number
  h: number
  mmPerUnit: number // 정규화 1단위 = 실 mm
}

export interface TileState {
  tiles: TileManifest | undefined
  planDims: PlanDims | undefined
}

// 뷰어 정규화 좌표계: 도면 종횡비 유지, 높이 470 기준(심볼·격자 크기 안정).
const NORMALIZED_H = 470

export function useTileManifest(url = '/tiles/manifest.json'): TileState {
  const [world, setWorld] = useState<{ w: number; h: number } | undefined>(undefined)
  const [tiles, setTiles] = useState<TileManifest | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const res = await fetch(url).catch(() => null)
      if (!alive || !res?.ok) return
      const raw: unknown = await res.json()
      const m = raw as TileManifest
      if (alive && m.worldMin && m.worldMax && m.levels) {
        const [ax, ay] = m.worldMin
        const [bx, by] = m.worldMax
        setWorld({ w: bx - ax, h: by - ay })
        setTiles(m)
      }
    }
    void load()
    return () => { alive = false }
  }, [url])

  const planDims = useMemo(() => {
    if (!world) return undefined
    const w = Math.round(NORMALIZED_H * (world.w / world.h))
    return { w, h: NORMALIZED_H, mmPerUnit: world.w / w }
  }, [world])

  return { tiles, planDims }
}

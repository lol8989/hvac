// 노드 테스트용 시드 로더 — 빌드 산출물(public/equipment-seed.json)을 1회 읽어 캐시한다.
// 4MB JSON이라 테스트마다 파싱하면 느리다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SeedData } from '../infrastructure/equipment/seed/seedTypes'

let cached: SeedData | null = null

export function nodeSeed(): SeedData {
  if (!cached) cached = JSON.parse(readFileSync(resolve('public/equipment-seed.json'), 'utf-8')) as SeedData
  return cached
}

export const loadNodeSeed = async (): Promise<SeedData> => nodeSeed()

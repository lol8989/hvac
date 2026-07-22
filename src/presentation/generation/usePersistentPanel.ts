// 우측 패널(모델 선택) 접힘/폭을 localStorage에 유지하는 훅 — 새로고침 후에도 복원.
// 폭은 ModelPanel의 260~560 범위로 클램프한다(수기 조작·낡은 값 방어).
import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

const OPEN_KEY = 'poc.panel.open'
const WIDTH_KEY = 'poc.panel.w'
const MIN_W = 260
const MAX_W = 560
const DEFAULT_W = 322

function loadOpen(): boolean {
  return localStorage.getItem(OPEN_KEY) !== '0'
}
function loadWidth(): number {
  const v = Number(localStorage.getItem(WIDTH_KEY))
  return Number.isFinite(v) && v > 0 ? Math.max(MIN_W, Math.min(MAX_W, v)) : DEFAULT_W
}

export function usePersistentPanel(): {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  width: number
  setWidth: Dispatch<SetStateAction<number>>
} {
  const [open, setOpen] = useState(loadOpen)
  const [width, setWidth] = useState(loadWidth)
  useEffect(() => {
    localStorage.setItem(OPEN_KEY, open ? '1' : '0')
  }, [open])
  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(width))
  }, [width])
  return { open, setOpen, width, setWidth }
}

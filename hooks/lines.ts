import type { LineSet } from '../types'

/** 기본 250ms 틱 기준 3초 */
const TICKS_PER_LINE = 12

const at = (list: string[], index: number, fallback: string) => list[index % list.length] ?? fallback

export const spinnerLine = (set: LineSet, fallback: string, tick: number, offset: number, perLine = TICKS_PER_LINE): string =>
  at(set.spinner, offset + Math.floor(tick / perLine), fallback)

export const idleLine = (set: LineSet, fallback: string, offset: number): string => at(set.idle, offset, fallback)

export const endingLine = (set: LineSet, random: number): string | null =>
  set.ending[Math.floor(random * set.ending.length)] ?? null

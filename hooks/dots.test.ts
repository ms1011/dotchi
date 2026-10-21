import { expect, test } from 'claude-code/testing'

import type { Frame } from '../types'
import { cropColumns, encodeFrame, halve, TRANSPARENT, usedColumns } from './dots'

const decode = (cells: string) => Array.from(new Uint32Array(Uint8Array.fromBase64(cells).buffer))

test('투명 두 칸은 기본색 공백', () => {
  expect(decode(encodeFrame([[null], [null]]).cells)).toEqual([0x20, TRANSPARENT, TRANSPARENT])
})

test('위만 색이면 ▀ 전경', () => {
  expect(decode(encodeFrame([['ff0000'], [null]]).cells)).toEqual([0x2580, 0xff0000, TRANSPARENT])
})

test('아래만 색이면 ▄ 전경', () => {
  expect(decode(encodeFrame([[null], ['00ff00']]).cells)).toEqual([0x2584, 0x00ff00, TRANSPARENT])
})

test('둘 다 색이면 ▀ 위 전경 아래 배경', () => {
  expect(decode(encodeFrame([['ff0000'], ['00ff00']]).cells)).toEqual([0x2580, 0xff0000, 0x00ff00])
})

test('32×32는 32칸 16줄, 행 우선', () => {
  const frame: Frame = Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, () => (y === 2 ? '0000ff' : null)))
  const encoded = encodeFrame(frame)
  expect(encoded.columns).toBe(32)
  expect(encoded.rows).toBe(16)
  const words = decode(encoded.cells)
  expect(words.length).toBe(32 * 16 * 3)
  expect(words.slice(32 * 3, 32 * 3 + 3)).toEqual([0x2580, 0x0000ff, TRANSPARENT])
})

test('halve는 16×16, 2×2 중 첫 불투명 색', () => {
  const frame: Frame = Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => null))
  frame[1]![0] = 'abcdef'
  frame[1]![1] = '123456'
  const half = halve(frame)
  expect(half.length).toBe(16)
  expect(half[0]!.length).toBe(16)
  expect(half[0]![0]).toBe('abcdef')
  expect(half[0]![1]).toBe(null)
})

const blank = (): Frame => Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => null))

test('usedColumns는 모든 컷에서 쓰인 가로 범위', () => {
  const idle = blank()
  const step = blank()
  idle[5]![6] = 'ffffff'
  step[9]![24] = 'ffffff'
  expect(usedColumns({ width: 32, height: 32, idle, work: [step] })).toEqual([6, 24])
  expect(usedColumns({ width: 32, height: 32, idle: blank(), work: [blank()] })).toEqual([0, 31])
})

test('cropColumns는 그 범위만 남긴다', () => {
  const frame = blank()
  frame[0]![6] = 'abcdef'
  const cropped = cropColumns(frame, 6, 24)
  expect(cropped.length).toBe(32)
  expect(cropped[0]!.length).toBe(19)
  expect(cropped[0]![0]).toBe('abcdef')
})

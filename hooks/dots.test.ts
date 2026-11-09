import { expect, test } from 'claude-code/testing'

import type { Frame } from '../types'
import { cropColumns, encodeFrame, halve, parseArt, stageArt, stageCount, TRANSPARENT, usedColumns } from './dots'

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

/* ---------- 단계 그림 ---------- */

const solid = (color: string): (string | null)[][] => Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => color))
const base = { width: 32, height: 32, idle: solid('aaaaaa'), work: [solid('111111')] }

test('stages 없는 옛 팩은 그대로', () => {
  const art = parseArt(JSON.stringify(base))
  expect(art).not.toBe(null)
  expect('stages' in art!).toBe(false)
  expect(stageCount(art!)).toBe(1)
})

test('stages를 싣는다', () => {
  const stages = { '2': { idle: solid('222222'), work: [solid('222222')] }, '3': { idle: solid('333333'), work: [solid('333333'), solid('343434')] } }
  const art = parseArt(JSON.stringify({ ...base, stages }))
  expect(art?.stages).toEqual(stages)
  expect(stageCount(art!)).toBe(3)
})

test('빈 stages는 단계 없음', () => {
  const art = parseArt(JSON.stringify({ ...base, stages: {} }))
  expect(art !== null && !('stages' in art)).toBe(true)
})

test('망가진 stages면 팩을 읽지 않는다', () => {
  const ok = { idle: solid('222222'), work: [solid('222222')] }
  expect(parseArt(JSON.stringify({ ...base, stages: { '4': ok } }))).toBe(null)
  expect(parseArt(JSON.stringify({ ...base, stages: { '2': { ...ok, work: Array(6).fill(solid('222222')) } } }))).toBe(null)
  expect(parseArt(JSON.stringify({ ...base, stages: { '2': { ...ok, idle: solid('222222').slice(1) } } }))).toBe(null)
  expect(parseArt(JSON.stringify({ ...base, stages: [ok] }))).toBe(null)
})

test('stageArt는 빠진 단계를 아래로 채운다', () => {
  const three = { idle: solid('333333'), work: [solid('333333')] }
  const art = parseArt(JSON.stringify({ ...base, stages: { '3': three } }))!
  expect(stageArt(art, 1)).toEqual({ idle: base.idle, work: base.work })
  expect(stageArt(art, 2)).toEqual({ idle: base.idle, work: base.work })
  expect(stageArt(art, 3)).toEqual(three)
  expect(stageCount(art)).toBe(2)
})

test('usedColumns는 단계까지 합친다', () => {
  const one = blank()
  one[5]![10] = 'aaaaaa'
  one[5]![20] = 'aaaaaa'
  const three = blank()
  three[0]![5] = 'bbbbbb'
  const art = parseArt(JSON.stringify({ ...base, idle: one, work: [one], stages: { '3': { idle: three, work: [three] } } }))!
  expect(usedColumns(art)).toEqual([5, 20])
})

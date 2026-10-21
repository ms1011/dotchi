import type { Art, Frame } from '../types'

/** Raster에서 터미널 기본색 */
export const TRANSPARENT = 0x01000000

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20
const SIZE = 32
const MAX_FRAMES = 5

const rgb = (color: string) => parseInt(color, 16)

const pixel = (frame: Frame, y: number, x: number) => frame[y]?.[x] ?? null

/** 2×2 묶음마다 왼쪽 위부터 처음 나오는 불투명 칸으로 반 크기 */
export const halve = (frame: Frame): Frame =>
  Array.from({ length: frame.length / 2 }, (_, y) =>
    Array.from({ length: (frame[0]?.length ?? 0) / 2 }, (_, x) => {
      const block = [
        pixel(frame, 2 * y, 2 * x),
        pixel(frame, 2 * y, 2 * x + 1),
        pixel(frame, 2 * y + 1, 2 * x),
        pixel(frame, 2 * y + 1, 2 * x + 1),
      ]
      return block.find(c => c !== null) ?? null
    }),
  )

/** 한 칸에 위아래 두 픽셀: 위는 전경 ▀, 아래만 있으면 ▄ */
export const encodeFrame = (frame: Frame): { columns: number; rows: number; cells: string } => {
  const columns = frame[0]?.length ?? 0
  const rows = frame.length / 2
  const words: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < columns; x++) {
      const top = pixel(frame, 2 * row, x)
      const bottom = pixel(frame, 2 * row + 1, x)
      if (top === null && bottom === null) words.push(SPACE, TRANSPARENT, TRANSPARENT)
      else if (top === null) words.push(LOWER_HALF, rgb(bottom as string), TRANSPARENT)
      else words.push(UPPER_HALF, rgb(top), bottom === null ? TRANSPARENT : rgb(bottom))
    }
  }
  return { columns, rows, cells: new Uint8Array(Uint32Array.from(words).buffer).toBase64() }
}

const isFrame = (value: unknown): value is Frame =>
  Array.isArray(value) &&
  value.length === SIZE &&
  value.every(
    row =>
      Array.isArray(row) &&
      row.length === SIZE &&
      row.every(c => c === null || (typeof c === 'string' && /^[0-9a-f]{6}$/.test(c))),
  )

/** art/<id>.json 내용을 검사해서 Art로, 모양이 틀리면 null */
export const parseArt = (text: string): Art | null => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  const art = raw as Partial<Art> | null
  if (art === null || typeof art !== 'object' || !isFrame(art.idle)) return null
  if (!Array.isArray(art.work) || art.work.length < 1 || art.work.length > MAX_FRAMES) return null
  if (!art.work.every(isFrame)) return null
  return { width: SIZE, height: SIZE, idle: art.idle, work: art.work }
}

/** 모든 컷(멈춘 그림 포함)에서 쓰인 가로 범위 [처음, 끝]. 비어 있으면 전체 */
export const usedColumns = (art: Art): [number, number] => {
  let from = SIZE
  let to = -1
  for (const frame of [art.idle, ...art.work]) {
    for (const row of frame) {
      row.forEach((c, x) => {
        if (c === null) return
        from = Math.min(from, x)
        to = Math.max(to, x)
      })
    }
  }
  return to < 0 ? [0, SIZE - 1] : [from, to]
}

/** 가로 [from, to] 칸만 남긴다: 말풍선을 캐릭터 머리에 붙이려고 */
export const cropColumns = (frame: Frame, from: number, to: number): Frame => frame.map(row => row.slice(from, to + 1))

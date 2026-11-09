import { expect, test } from 'claude-code/testing'

import type { Grow, Reading } from './grow'
import {
  EMPTY_GROW,
  localDay,
  mondayOf,
  noteStage,
  observe,
  parseGrow,
  recordAnswer,
  recordCost,
  recordPat,
  seen,
  shownStage,
  stageOfDays,
  stageOfPercent,
  styleOf,
  weekStage,
} from './grow'

const HOUR = 3600000
const DAY = 24 * HOUR
/** 이 컴퓨터 시간대의 시각 (테스트가 시간대에 상관없게) */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()
/** 2026-11-09 월요일 정오 */
const NOW = at(2026, 11, 9)
const RESET = '2026-11-14T00:00:00.000Z'
const NEXT_RESET = '2026-11-21T00:00:00.000Z'
const limit = (percent: number, resetsAt: string | null = RESET): Reading => ({ kind: 'limit', percent, resetsAt })
const NONE: Reading = { kind: 'none' }

test('사용률 3등분', () => {
  expect([0, 32.9, 33, 65.9, 66, 100].map(stageOfPercent)).toEqual([1, 1, 2, 2, 3, 3])
})

test('날 수', () => {
  expect([0, 1, 2, 3, 4, 7].map(stageOfDays)).toEqual([1, 1, 2, 2, 3, 3])
})

test('이 컴퓨터 시간대의 날과 그 주 월요일', () => {
  expect(localDay(at(2026, 11, 9, 0, 5))).toBe('2026-11-09')
  expect(mondayOf(at(2026, 11, 15, 23, 59))).toBe('2026-11-09')
  expect(mondayOf(at(2026, 11, 16, 0, 0))).toBe('2026-11-16')
  expect(mondayOf(at(2026, 11, 9, 0, 0))).toBe('2026-11-09')
})

test('한도 계정은 빈 읽기에 주를 넘기지 않는다', () => {
  const a = observe(EMPTY_GROW, limit(40), NOW, 'squirrel').grow
  expect(a.source).toBe('limit')
  const b = observe(a, NONE, NOW + 9 * DAY, 'squirrel')
  expect(b.rolled).toBe(null)
  expect(b.grow).toEqual(a)
})

test('resetsAt이 잠깐 빠져도 같은 주', () => {
  const a = observe(EMPTY_GROW, limit(40), NOW, 'squirrel').grow
  const b = observe(a, limit(41, null), NOW + HOUR, 'squirrel')
  expect(b.rolled).toBe(null)
  expect(b.grow.week?.limit).toEqual({ resetsAt: RESET, percent: 41 })
})

test('리셋되면 앨범 한 줄, 새 주는 1단계', () => {
  let g = observe(EMPTY_GROW, limit(70), NOW, 'squirrel').grow
  g = noteStage(g, 3).grow
  g = recordPat(recordPat(g))
  g = recordAnswer(g, at(2026, 11, 9, 23))
  const { grow, rolled } = observe(g, limit(1, NEXT_RESET), NOW + 5 * DAY, 'squirrel')
  expect(rolled).toEqual({ start: localDay(Date.parse(RESET) - 7 * DAY), pet: 'squirrel', stage: 3, pats: 2, style: 'owl' })
  expect(grow.album).toEqual([rolled!])
  expect(grow.week?.peak).toBe(1)
  expect(grow.week?.pats).toBe(0)
  expect(grow.week?.limit).toEqual({ resetsAt: NEXT_RESET, percent: 1 })
})

test('cal 주는 월요일에 넘어간다', () => {
  const g = recordAnswer(EMPTY_GROW, NOW)
  expect(g.source).toBe('cal')
  expect(g.week?.monday).toBe('2026-11-09')
  expect(observe(g, NONE, at(2026, 11, 15, 23, 59), 'turtle').rolled).toBe(null)
  const next = observe(g, NONE, at(2026, 11, 16, 0, 0), 'turtle')
  expect(next.rolled?.start).toBe('2026-11-09')
  expect(next.grow.week?.monday).toBe('2026-11-16')
  expect(next.grow.week?.days).toEqual([])
})

test('여러 주가 지나도 앨범은 한 줄', () => {
  const g = recordAnswer(EMPTY_GROW, NOW)
  const { grow } = observe(g, NONE, NOW + 21 * DAY, 'turtle')
  expect(grow.album.length).toBe(1)
  expect(grow.week?.monday).toBe('2026-11-30')
})

test('아무 일도 없던 주는 앨범에 남기지 않는다', () => {
  const g = observe(EMPTY_GROW, NONE, NOW, 'turtle').grow
  expect(observe(g, NONE, NOW + 7 * DAY, 'turtle').rolled).toBe(null)
})

test('reset off면 kept 아래로 내려가지 않는다', () => {
  let g = observe(EMPTY_GROW, limit(20), NOW, 'p').grow
  g = noteStage(g, 3).grow
  g = observe(g, limit(10, NEXT_RESET), NOW + 5 * DAY, 'p').grow
  expect(shownStage(g, limit(10, NEXT_RESET), { reset: false, budgetUsd: null })).toBe(3)
  expect(shownStage(g, limit(10, NEXT_RESET), { reset: true, budgetUsd: null })).toBe(1)
})

test('처음 만든 주는 진화 알림 없이 시작', () => {
  const g = observe(EMPTY_GROW, limit(50), NOW, 'p').grow
  expect(g.week?.peak).toBe(2)
  expect(noteStage(g, 2).evolved).toBe(null)
  expect(noteStage(g, 3).evolved).toBe(3)
  expect(noteStage(noteStage(g, 3).grow, 3).evolved).toBe(null)
})

test('비용이 줄면 새로 센다', () => {
  let g = recordCost(EMPTY_GROW, 's1', 2)
  g = recordCost(g, 's1', 5)
  g = recordCost(g, 's1', 1)
  expect(g.week?.spentUsd).toBe(6)
  g = recordCost(g, 's2', 3)
  expect(g.week?.spentUsd).toBe(9)
})

test('비용 기록은 최근 20개 세션만', () => {
  let g: Grow = EMPTY_GROW
  for (let i = 0; i < 25; i++) g = recordCost(g, `s${i}`, 1)
  expect(Object.keys(g.costs).length).toBe(20)
  expect(g.costs.s24).toBe(1)
  expect(g.costs.s0).toBe(undefined)
})

test('예산 단계, 예산이 없으면 날 수', () => {
  let g = recordCost(EMPTY_GROW, 's1', 7)
  expect(weekStage(g, NONE, 20)).toBe(2)
  expect(weekStage(g, NONE, 10)).toBe(3)
  expect(weekStage(g, NONE, null)).toBe(1)
  g = recordAnswer(recordAnswer(g, NOW), NOW + DAY)
  expect(weekStage(g, NONE, null)).toBe(2)
})

test('한도가 있으면 한도가 먼저', () => {
  const g = recordCost(observe(EMPTY_GROW, limit(10), NOW, 'p').grow, 's1', 100)
  expect(weekStage(g, limit(10), 20)).toBe(1)
})

test('일하는 시간대', () => {
  const hours = (pairs: [number, number][]) => {
    const list = Array(24).fill(0) as number[]
    for (const [h, n] of pairs) list[h] = n
    return list
  }
  expect(styleOf(Array(24).fill(0))).toBe(null)
  expect(styleOf(hours([[23, 5], [14, 2]]))).toBe('owl')
  expect(styleOf(hours([[3, 1], [6, 2]]))).toBe('morning')
  expect(styleOf(hours([[9, 3], [14, 3]]))).toBe('day')
  expect(styleOf(hours([[6, 3], [23, 3]]))).toBe('morning')
})

test('24시간 넘게 쉬면 반긴다', () => {
  const first = seen(EMPTY_GROW, NOW)
  expect(first.welcome).toBe(false)
  expect(first.grow.lastSeen).toBe(NOW)
  expect(seen(first.grow, NOW + 23 * HOUR).welcome).toBe(false)
  expect(seen(first.grow, NOW + 24 * HOUR).welcome).toBe(true)
})

test('parseGrow는 망가진 값을 기본값으로', () => {
  expect(parseGrow('x')).toEqual(EMPTY_GROW)
  expect(parseGrow({ kept: 7, album: 'no' })).toEqual(EMPTY_GROW)
  const entry = { start: '2026-01-05', pet: 'p', stage: 2, pats: 0, style: null }
  const parsed = parseGrow({ ...EMPTY_GROW, album: Array(53).fill(entry) })
  expect(parsed.album.length).toBe(52)
  const g = recordPat(observe(EMPTY_GROW, limit(40), NOW, 'p').grow)
  expect(parseGrow(JSON.parse(JSON.stringify(g)))).toEqual(g)
})

test('리셋 시각이 지났는데 아직 새 읽기가 없으면 1단계로 보인다 (넘기지는 않는다)', () => {
  const g = observe(EMPTY_GROW, limit(70), NOW, 'p').grow
  expect(weekStage(g, NONE, null, NOW)).toBe(3)
  expect(weekStage(g, NONE, null, Date.parse(RESET) + HOUR)).toBe(1)
  expect(observe(g, NONE, Date.parse(RESET) + HOUR, 'p').rolled).toBe(null)
})

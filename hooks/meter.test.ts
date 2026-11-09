import { expect, test } from 'claude-code/testing'

import type { Art, GitState } from '../types'
import { when } from './talk'
import { fill } from './test-kit'
import {
  accentOf,
  bar,
  cardOf,
  contextLevel,
  elapsed,
  hearts,
  iconOf,
  meterOf,
  parseNumstat,
  prettyModel,
  statusLine,
  textCols,
  weekLevel,
  windowLabel,
} from './meter'
import type { Meter } from './meter'
import { DEFAULT_LOOK } from './theme'

const DAY = 86400000
const RESET = '2026-11-09T00:00:00.000Z'
const resetMs = Date.parse(RESET)
/** 리셋 3일 전 = 이번 주의 4일째 */
const NOW = resetMs - 3 * DAY

const git: GitState = { branch: 'main', ahead: 2, files: [] }
const meter = (over: Partial<Meter> = {}): Meter => ({
  context: { percent: 62, tokens: 124000, window: 200000 },
  week: { percent: 41, resetsAt: resetMs, emptyAt: null },
  costUsd: 1.234,
  model: 'Opus 5.5',
  ...over,
})
const base = {
  meter: meter(),
  git,
  artifacts: [],
  icon: '🌰',
  mode: 'full' as const,
  cost: false,
  elapsedMs: 0,
  lang: 'ko' as const,
}

test('하트는 다섯 칸, 세션이 찬 만큼 찬다', () => {
  expect(hearts(0)).toBe('♡♡♡♡♡')
  expect(hearts(62)).toBe('♥♥♥♡♡')
  expect(hearts(100)).toBe('♥♥♥♥♥')
  expect(hearts(140)).toBe('♥♥♥♥♥')
})

test('막대는 칸 수만큼, 쓴 만큼 찬다', () => {
  expect(bar(41, 10)).toBe('▰▰▰▰▱▱▱▱▱▱')
  expect(bar(0, 6)).toBe('▱▱▱▱▱▱')
  expect(bar(-5, 4)).toBe('▱▱▱▱')
})

test('단계: 컨텍스트는 70·90, 주간은 80·95', () => {
  expect([69, 70, 89, 90].map(p => contextLevel(p))).toEqual(['ok', 'warn', 'warn', 'danger'])
  expect([79, 80, 94, 95].map(p => weekLevel(p))).toEqual(['ok', 'warn', 'warn', 'danger'])
})

test('모델 이름: id는 읽기 좋게, 나머지는 그대로', () => {
  expect(prettyModel('claude-opus-5-5')).toBe('Opus 5.5')
  expect(prettyModel('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(prettyModel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(prettyModel('Opus 5.5 (1M context)')).toBe('Opus 5.5 (1M context)')
})

test('창 크기는 짧게', () => {
  expect(windowLabel(1000000)).toBe('1M')
  expect(windowLabel(200000)).toBe('200k')
})

test('지난 시간: 1분 전에는 없고, 시간이 넘으면 시·분', () => {
  expect(elapsed('ko', 30000)).toBe(null)
  expect(elapsed('ko', 12 * 60000 + 5000)).toBe('12분')
  expect(elapsed('ko', 65 * 60000)).toBe('1시간 5분')
  expect(elapsed('en', 65 * 60000)).toBe('1h 5m')
})

test('numstat: 바이너리(-)는 빼고 더한다', () => {
  expect(parseNumstat('10\t2\ta.ts\n-\t-\tlogo.png\n3\t0\tb.ts\n')).toEqual({ added: 13, removed: 2 })
  expect(parseNumstat('')).toEqual({ added: 0, removed: 0 })
})

test('측정값을 계기로: 주간 창만, 지금 속도로 리셋 전에 바닥날지', () => {
  const m = meterOf(
    {
      context: { tokens: 124000, window: 200000, percent: 62 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 90 },
        { kind: 'seven_day', percentUsed: 80, resetsAt: RESET },
      ],
      cost: { usd: 2.5 },
    },
    'claude-opus-5-5',
    NOW,
  )
  expect(m.context).toEqual({ percent: 62, tokens: 124000, window: 200000 })
  expect(m.week?.percent).toBe(80)
  expect(m.week?.resetsAt).toBe(resetMs)
  // 4일에 80%: 5일째에 바닥 → 리셋 전
  expect(m.week?.emptyAt).toBe(resetMs - 2 * DAY)
  expect(m.costUsd).toBe(2.5)
  expect(m.model).toBe('Opus 5.5')
})

test('측정값이 비어 있으면 비운 채로', () => {
  const m = meterOf({ context: { window: 200000 }, rateLimits: [] }, null, NOW)
  expect(m).toEqual({ context: { percent: null, tokens: null, window: 200000 }, week: null, costUsd: null, model: null })
})

test('상태 줄: 아이콘, 세션, 주간, git, 시간, 아티팩트', () => {
  const line = statusLine({
    ...base,
    git: { ...git, files: [{ code: 'M', path: 'a.ts' }], added: 120, removed: 8 },
    artifacts: [{ url: 'u', title: '보고서' }],
    elapsedMs: 12 * 60000,
  })
  expect(line).toBe('🌰 ♥♥♥♡♡ 62% · ⚡ 41% · ⎇ main ↑2 · 파일 1개 +120 −8 · 12분 · 🔗 보고서')
})

test('상태 줄: 갓 시작하면 0인 것은 다 숨긴다', () => {
  const fresh = meter({ context: { percent: null, tokens: null, window: 200000 }, week: null })
  expect(statusLine({ ...base, meter: fresh })).toBe('🌰 ⎇ main ↑2')
  expect(statusLine({ ...base, meter: fresh, git: null })).toBe(undefined)
  expect(statusLine({ ...base, meter: null, git: null })).toBe(undefined)
})

test('상태 줄: 기본(얼굴 없음)은 꽉 차면 /compact만 권한다', () => {
  expect(statusLine({ ...base, git: null, meter: meter({ context: { percent: 78, tokens: 1, window: 2 }, week: null }) })).toBe(
    '🌰 ♥♥♥♥♡ 78%',
  )
  expect(statusLine({ ...base, git: null, meter: meter({ context: { percent: 93, tokens: 1, window: 2 }, week: null }) })).toBe(
    '🌰 ♥♥♥♥♥ 93% /compact',
  )
})

test('상태 줄: 리셋 전에 바닥날 것 같으면 하품', () => {
  const tired = meter({ week: { percent: 70, resetsAt: resetMs, emptyAt: resetMs - DAY } })
  expect(statusLine({ ...base, git: null, meter: tired })).toBe('🌰 ♥♥♥♡♡ 62% · ⚡ 70% 🥱')
})

test('상태 줄: 비용은 켰을 때만', () => {
  expect(statusLine({ ...base, git: null, cost: true })).toBe('🌰 ♥♥♥♡♡ 62% · ⚡ 41% · $1.23')
  expect(statusLine({ ...base, git: null, cost: true, meter: meter({ costUsd: 0 }) })).toBe('🌰 ♥♥♥♡♡ 62% · ⚡ 41%')
})

test('상태 줄 mini: 퍼센트와 브랜치만', () => {
  const line = statusLine({
    ...base,
    mode: 'mini',
    git: { ...git, files: [{ code: 'M', path: 'a.ts' }], added: 3, removed: 1 },
    artifacts: [{ url: 'u', title: '보고서' }],
    elapsedMs: 12 * 60000,
    cost: true,
  })
  expect(line).toBe('🌰 62% · ⚡ 41% · ⎇ main ↑2')
})

test('패널 카드: 세션·주간 줄과 바닥 줄', () => {
  const card = cardOf(meter(), { elapsedMs: 12 * 60000, cost: true, lang: 'ko', width: 10 })
  expect(card.rows).toEqual([
    { kind: 'context', lead: '♥', label: '세션', bar: '▰▰▰▰▰▰▱▱▱▱', percent: '62%', level: 'ok', tail: '' },
    { kind: 'week', lead: '⚡', label: '주간', bar: '▰▰▰▰▱▱▱▱▱▱', percent: '41%', level: 'ok', tail: ` ↻ ${when('ko', resetMs)}` },
  ])
  expect(card.foot).toBe('⏱ 12분 · Opus 5.5 · 200k · $1.23')
})

test('패널 카드: 위험하면 /compact, 바닥날 것 같으면 하품과 그 시각', () => {
  const card = cardOf(
    meter({ context: { percent: 95, tokens: 1, window: 1000000 }, week: { percent: 96, resetsAt: resetMs, emptyAt: resetMs - DAY } }),
    { elapsedMs: 0, cost: false, lang: 'ko', width: 10 },
  )
  expect(card.rows.map(r => [r.lead, r.level, r.tail])).toEqual([
    ['♥', 'danger', ' /compact'],
    ['⚡', 'danger', ` 🥱 ${when('ko', resetMs - DAY)}`],
  ])
  expect(card.foot).toBe('Opus 5.5 · 1M')
})

test('패널 카드: 아무것도 모르면 비어 있다', () => {
  expect(cardOf(null, { elapsedMs: 0, cost: false, lang: 'ko', width: 10 })).toEqual({ rows: [], foot: null })
})

test('아이콘: 팩에 있으면 그것, 없으면 발자국', () => {
  expect(iconOf({ format: 1, id: 'a', name: 'a', icon: '🌰' })).toBe('🌰')
  expect(iconOf({ format: 1, id: 'a', name: 'a' })).toBe('🐾')
  expect(iconOf(null)).toBe('🐾')
})

test('대표색: 가장 많이 쓴 색을 어두운 화면에서 읽히게 밝힌다. 무채색뿐이면 라벤더', () => {
  const frame = fill('8b5a2b')
  frame[0]![0] = '000000'
  const art: Art = { width: 32, height: 32, idle: frame, work: [frame] }
  const accent = accentOf(art)
  expect(accent).toMatch(/^#[0-9a-f]{6}$/)
  const [r, g, b] = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16)) as [number, number, number]
  expect(0.299 * r + 0.587 * g + 0.114 * b).toBeGreaterThanOrEqual(150)
  // 갈색 기운은 남는다: 빨강 > 초록 > 파랑
  expect(r > g && g > b).toBe(true)
  const gray = fill('777777')
  expect(accentOf({ width: 32, height: 32, idle: gray, work: [gray] })).toBe('#b8a6ff')
  expect(accentOf(null)).toBe('#b8a6ff')
})

test('칸 수: 한글·한자·가나는 두 칸', () => {
  expect(textCols('Full')).toBe(4)
  expect(textCols('배부름')).toBe(6)
  expect(textCols('満腹')).toBe(4)
})

test('기준을 바꾸면 단계도 그 기준으로', () => {
  const t = { warn: 50, danger: 75 }
  expect([49, 50, 74, 75].map(p => contextLevel(p, t))).toEqual(['ok', 'warn', 'warn', 'danger'])
  expect([49, 50, 74, 75].map(p => weekLevel(p, t))).toEqual(['ok', 'warn', 'warn', 'danger'])
})

test('상태 줄과 카드는 설정한 기준을 따른다', () => {
  const gauge = { context: { warn: 50, danger: 60 }, week: { warn: 30, danger: 40 } }
  expect(statusLine({ ...base, git: null, gauge })).toBe('🌰 ♥♥♥♡♡ 62% /compact · ⚡ 41%')
  const card = cardOf(meter(), { elapsedMs: 0, cost: false, lang: 'ko', width: 10, gauge })
  expect(card.rows.map(r => r.level)).toEqual(['danger', 'danger'])
})

test('칸 수: 그림 이모지는 두 칸, 이음·변형 글자는 0칸', () => {
  expect(textCols('⚡')).toBe(2)
  expect(textCols('🍬')).toBe(2)
  expect(textCols('❤️')).toBe(2)
  expect(textCols('(•ᴗ•)')).toBe(5)
})

test('테마 모양: 하트·막대·얼굴·기호가 테마를 따른다', () => {
  const look = {
    colors: { ok: '#000001', warn: '#000002', danger: '#000003', dim: '#000004', accent: 'pet' },
    faces: { ok: 'A', warn: 'B', danger: 'C' },
    hearts: ['#', '.'] as [string, string],
    bar: ['=', '-'] as [string, string],
    symbols: { week: 'wk', tired: 'zz', reset: '@', time: 't' },
  }
  const tired = meter({ context: { percent: 93, tokens: 1, window: 2 }, week: { percent: 70, resetsAt: resetMs, emptyAt: resetMs - DAY } })
  expect(statusLine({ ...base, git: null, meter: tired, look })).toBe('🌰 ##### 93% C /compact · wk 70% zz')
  const card = cardOf(tired, { elapsedMs: 12 * 60000, cost: false, lang: 'ko', width: 4, look })
  expect(card.rows.map(r => [r.lead, r.bar, r.tail])).toEqual([
    ['C', '====', ' /compact'],
    ['wk', '===-', ` zz ${when('ko', resetMs - DAY)}`],
  ])
  expect(card.foot?.startsWith('t 12분')).toBe(true)
})

test('얼굴이 없는 테마: 상태 줄엔 얼굴 없이, 패널 세션 줄은 하트 기호로 시작', () => {
  const look = { ...DEFAULT_LOOK, faces: { ok: '', warn: '', danger: '' }, hearts: ['#', '.'] as [string, string] }
  const meter = (percent: number) => ({ context: { percent, tokens: 1000, window: 200000 }, week: null, costUsd: null, model: null })
  const base = { git: null, artifacts: [], icon: '🌰', mode: 'full', cost: false, elapsedMs: 0, lang: 'ko', look } as const
  expect(statusLine({ ...base, meter: meter(78) })).toBe('🌰 ####. 78%')
  expect(statusLine({ ...base, meter: meter(93) })).toBe('🌰 ##### 93% /compact')
  expect(cardOf(meter(78), { elapsedMs: 0, cost: false, lang: 'ko', width: 10, look }).rows[0]!.lead).toBe('#')
})

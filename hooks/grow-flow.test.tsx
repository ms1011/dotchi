import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, SESSION } from './test-kit'

const HOUR = 3600000
const DAY = 24 * HOUR
const RESET = '2026-11-14T00:00:00.000Z'
const NEXT_RESET = '2026-11-21T00:00:00.000Z'
const NOW = Date.parse(RESET) - 4 * DAY

const setup = (on: On, options: { store?: Record<string, unknown>; cost?: number } = {}) => {
  const engine = fakeEngine(on, {
    files: BUILTINS,
    store: { settings: { character: 'squirrel', show: 'working', voice: false, lang: 'ko' }, ...options.store },
    ...(options.cost === undefined ? {} : { cost: options.cost }),
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.SessionStart', () => ({}))
  return engine
}

const measure = (percentUsed: number, resetsAt = RESET) => ({
  context: { window: 200000 },
  rateLimits: [{ kind: 'seven_day', percentUsed, resetsAt }],
  changed: ['rateLimits' as const],
})
const answer = { answer: '답변', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

/** 위쪽 띠의 말풍선 글 (없으면 undefined) */
const bubble = async ($: Engine): Promise<string | undefined> => {
  const ui = await $.ui.mount({
    plugin: 'dotchi',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 100, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  const found = await ui.find({ type: 'Text', text: /./ })
  await ui.unmount()
  return found?.text === 'engine' ? undefined : found?.text
}
const reply = async ($: Engine, args: string) => ((await dotchi($, args)) as { text: string }).text

test('한도 40% → 70%로 오르면 다 컸다고(이제 아껴 쓰자) 말하고 토스트, 3단계', async ($, on) => {
  const { clock, toasts } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(40))
  expect(await bubble($)).toBe(undefined)
  await $.session.measure(measure(70))
  expect(await bubble($)).toMatch(/다 컸어요! 이번 주는 천천히 가요/)
  expect(toasts.some(t => /다 컸어요/.test(t))).toBe(true)
  const text = await reply($, 'grow')
  expect(text).toMatch(/Stage 3 of 3/)
  expect(text).not.toMatch(/next stage/)
})

test('처음 읽기가 70%면 조용히 3단계', async ($, on) => {
  const { clock, toasts } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(70))
  expect(await bubble($)).toBe(undefined)
  expect(toasts.length).toBe(0)
  expect(await reply($, 'grow')).toMatch(/Stage 3 of 3/)
})

test('리셋되면 앨범에 한 줄, 1단계로', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect(await reply($, 'album')).toMatch(/No weeks in the album yet/)
  await $.session.measure(measure(70))
  await $.session.measure(measure(1, NEXT_RESET))
  expect(await reply($, 'album')).toMatch(/★★★/)
  expect(await reply($, 'grow')).toMatch(/Stage 1 of 3/)
})

test('reset off면 리셋 뒤에도 3단계', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect(await reply($, 'grow reset off')).toMatch(/Weekly reset: off/)
  await $.session.measure(measure(70))
  await $.session.measure(measure(1, NEXT_RESET))
  expect(await reply($, 'grow')).toMatch(/Stage 3 of 3/)
  await dotchi($, 'grow reset on')
  expect(await reply($, 'grow')).toMatch(/Stage 1 of 3/)
})

test('한도가 없는 계정은 답변한 날로 자란다', async ($, on) => {
  const { clock } = setup(on)
  // 월요일 정오부터
  await clock.set(new Date(2026, 10, 9, 12).getTime())
  await $.session.start(SESSION)
  for (let day = 0; day < 4; day++) {
    await $.turn.complete(answer)
    await clock.advance(DAY)
  }
  const text = await reply($, 'grow')
  expect(text).toMatch(/Stage 3 of 3/)
  expect(text).toMatch(/4 days/)
})

test('예산 $10에 비용 $7 → 3단계', async ($, on) => {
  const { clock } = setup(on, { cost: 7 })
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect(await reply($, 'grow budget 10')).toMatch(/Budget: \$10/)
  await $.turn.complete(answer)
  expect(await reply($, 'grow')).toMatch(/Stage 3 of 3/)
  expect(await reply($, 'grow budget off')).toMatch(/Budget: off/)
})

test('하루 넘게 쉬고 시작하면 반긴다', async ($, on) => {
  const { clock } = setup(on, { store: { grow: { lastSeen: NOW - 25 * HOUR } } })
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect(await bubble($)).toMatch(/기다리고 있었어요/)
})

test('하루가 안 됐으면 반기지 않는다', async ($, on) => {
  const { clock } = setup(on, { store: { grow: { lastSeen: NOW - 2 * HOUR } } })
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect(await bubble($)).toBe(undefined)
})

test('evolve는 없는 펫이면 알려 준다', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect(await reply($, 'evolve nobody')).toMatch(/nobody/)
  expect(await reply($, '')).toMatch(/Growth: stage 1/)
})

test('2단계로 오르면 자랐다고 말한다, 한도 주는 다음 단계를 목표로 내밀지 않는다', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(10))
  await $.session.measure(measure(40))
  expect(await bubble($)).toMatch(/2단계로 자랐어요/)
  expect(await reply($, 'grow')).not.toMatch(/next stage/)
})

test('/clear 뒤에도 저장된 단계를 다시 읽는다', async ($, on) => {
  const { clock, stored } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(10))
  // 다른 세션이 이번 주를 70%까지 올려 두었다
  const grow = JSON.parse(JSON.stringify(stored.grow)) as { week: { limit: { percent: number }; peak: number }; kept: number }
  grow.week.limit.percent = 70
  grow.week.peak = 3
  grow.kept = 3
  stored.grow = grow
  await $.classic.SessionStart({ source: 'clear' })
  expect(await reply($, '')).toMatch(/Growth: stage 3/)
})

test('이 세션의 오래된 읽기로 주를 넘기지 않는다 (다른 세션이 더 높게 써 둠)', async ($, on) => {
  const { clock, stored } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(40))
  const grow = JSON.parse(JSON.stringify(stored.grow)) as { week: { limit: { percent: number } } }
  grow.week.limit.percent = 50
  stored.grow = grow
  await $.turn.complete({ ...answer, reason: 'aborted', isAborted: true } as unknown as typeof answer)
  await dotchi($, 'grow budget 10')
  expect(await reply($, 'album')).toMatch(/No weeks in the album yet/)
})

test('월요일 첫 답변은 새 주에 센다', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(new Date(2026, 10, 15, 23).getTime())
  await $.session.start(SESSION)
  await $.turn.complete(answer)
  await clock.set(new Date(2026, 10, 16, 0, 30).getTime())
  await $.turn.complete(answer)
  expect(await reply($, 'grow')).toMatch(/1 days with Claude this week/)
})

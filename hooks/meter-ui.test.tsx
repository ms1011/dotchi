import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionMeasureInput } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, runCommand, SESSION } from './test-kit'

const DAY = 86400000
const RESET = '2026-11-09T00:00:00.000Z'
const NOW = Date.parse(RESET) - 3 * DAY

/** 다람쥐에게 도토리 아이콘 */
const FILES = {
  ...BUILTINS,
  'characters/squirrel/dotchi.json': JSON.stringify({ format: 1, id: 'squirrel', name: { ko: '다람쥐' }, icon: '🌰' }),
}

const band = {
  plugin: 'dotchi',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 100, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const pane = {
  plugin: 'dotchi',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'dotchi',
  props: { title: 'dotchi', isFocused: false, bodyColumns: 47, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const setup = (on: On, options: { show?: string; repo?: boolean; numstat?: string; store?: Record<string, unknown> } = {}) => {
  const engine = fakeEngine(on, {
    files: FILES,
    model: 'claude-opus-5-5',
    store: { settings: { character: 'squirrel', show: options.show ?? 'working', voice: false, lang: 'ko' }, ...options.store },
    run: argv => {
      if (argv[0] !== 'git') return undefined
      if (options.repo !== true) return { exitCode: 128, stderr: 'fatal: not a git repository' }
      if (argv.includes('rev-parse')) return { exitCode: 0, stdout: '/work\n' }
      if (argv.includes('diff')) return { exitCode: 0, stdout: options.numstat ?? '' }
      return { exitCode: 0, stdout: '# branch.head main\n1 .M N... 100644 100644 100644 a b a.ts\n' }
    },
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  return engine
}

const measure = (context: number | undefined, week?: number): SessionMeasureInput => ({
  context: { window: 200000, ...(context === undefined ? {} : { percent: context, tokens: context * 2000 }) },
  rateLimits: week === undefined ? [] : [{ kind: 'seven_day', percentUsed: week, resetsAt: RESET }],
  cost: { usd: 1.5 },
  changed: ['context', 'rateLimits', 'cost'],
})

const bandText = async ($: Engine) => {
  const ui = await $.ui.mount(band)
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  await ui.unmount()
  return all
}

test('측정값이 오면 상태 줄에 아이콘, 배부름, 주간', async ($, on) => {
  const { statuses, clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await clock.settle()
  await $.session.measure(measure(62, 41))
  expect(statuses.at(-1)).toBe('🌰 ♥♥♥♡♡ 62% · ⚡ 41%')
})

test('git의 바뀐 줄 수와 지난 시간도 상태 줄에', async ($, on) => {
  const { statuses, clock } = setup(on, { repo: true, numstat: '12\t3\ta.ts\n' })
  await clock.set(NOW)
  await $.session.start(SESSION)
  await clock.settle()
  await clock.advance(12 * 60000)
  expect(statuses.at(-1)).toBe('🌰 ⎇ main · 파일 1개 +12 −3 · 12분')
})

test('컨텍스트 90%를 넘으면 한 번만 말하고, /compact로 내려간 뒤 다시 넘으면 또', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(92))
  expect(await bandText($)).toContain('배가 꽉 찼어요 (92%)')
  await $.prompt.submit({ text: 'ok' } as never)
  await $.session.measure(measure(93))
  expect(await bandText($)).not.toContain('배가 꽉')
  await $.session.measure(measure(40))
  await $.session.measure(measure(91))
  expect(await bandText($)).toContain('배가 꽉 찼어요 (91%)')
})

test('한도 경고를 끄면 배부름 말풍선도 없다', async ($, on) => {
  const { clock } = setup(on, { store: {} })
  await clock.set(NOW)
  await $.session.start(SESSION)
  await dotchi($, 'limit off')
  await $.session.measure(measure(95))
  expect(await bandText($)).not.toContain('배가 꽉')
})

test('/dotchi line: mini, 비용, off', async ($, on) => {
  const { statuses, clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(62, 41))
  expect((await dotchi($, 'line mini')).text).toContain('Done.')
  expect(statuses.at(-1)).toBe('🌰 62% · ⚡ 41%')
  await dotchi($, 'line full')
  await dotchi($, 'line cost on')
  expect(statuses.at(-1)).toBe('🌰 ♥♥♥♡♡ 62% · ⚡ 41% · $1.50')
  await dotchi($, 'line off')
  expect(statuses.at(-1)).toBe(undefined)
  const { text } = await dotchi($, '')
  expect(text).toContain('Status line: off · cost on')
})

test('옆 패널: 상태 카드에 색, 얼굴은 펫 대표색(무채색 펫이면 라벤더)', async ($, on) => {
  const { clock } = setup(on, { show: 'side' })
  await clock.set(NOW)
  await $.session.start(SESSION)
  await runCommand($, 'dotchi', 'show side', 237)
  await $.session.measure(measure(78, 41))
  const ui = await $.ui.mount(pane)
  const texts = await ui.findAll({ type: 'Text' })
  const face = texts.find(t => t.text === '(•_•;)')
  expect(face?.props.color).toBe('#ffd86b')
  const bars = texts.filter(t => /▰/.test(t.text)).map(t => [t.text, t.props.color])
  expect(bars).toEqual([
    ['▰▰▰▰▰▰▰▰▱▱ 78%', '#ffd86b'],
    ['▰▰▰▰▱▱▱▱▱▱ 41%', '#8fd9b6'],
  ])
  expect(texts.some(t => t.text === 'Opus 5.5 · 200k')).toBe(true)
  await ui.unmount()

  await $.session.measure(measure(30, 41))
  const calm = await $.ui.mount(pane)
  const happy = (await calm.findAll({ type: 'Text' })).find(t => t.text === '(•ᴗ•)')
  expect(happy?.props.color).toBe('#b8a6ff')
  await calm.unmount()
})

test('line off면 패널에도 상태 카드가 없다', async ($, on) => {
  const { clock } = setup(on, { show: 'side' })
  await clock.set(NOW)
  await $.session.start(SESSION)
  await runCommand($, 'dotchi', 'show side', 237)
  await dotchi($, 'line off')
  await $.session.measure(measure(78, 41))
  const ui = await $.ui.mount(pane)
  expect((await ui.findAll({ type: 'Text' })).some(t => /▰/.test(t.text))).toBe(false)
  await ui.unmount()
})

test('/dotchi line context: 바꾼 기준으로 말풍선과 상태 줄', async ($, on) => {
  const { statuses, clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  expect((await dotchi($, 'line context 50 80')).text).toContain('Done.')
  await $.session.measure(measure(62, 41))
  expect(statuses.at(-1)).toBe('🌰 ♥♥♥♡♡ 62% (•_•;) · ⚡ 41%')
  expect(await bandText($)).not.toContain('배가 꽉')
  await $.session.measure(measure(81))
  expect(await bandText($)).toContain('배가 꽉 찼어요 (81%)')
  expect((await dotchi($, '')).text).toContain('Gauge: context 50/80% · week 80/95%')
  await dotchi($, 'line context reset')
  expect((await dotchi($, '')).text).toContain('Gauge: context 70/90% · week 80/95%')
})

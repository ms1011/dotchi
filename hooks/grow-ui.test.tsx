import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { stars, statusLine } from './meter'
import { BUILTINS, fakeEngine, fill, packFiles, SESSION } from './test-kit'

const RESET = '2026-11-14T00:00:00.000Z'
const NOW = Date.parse(RESET) - 4 * 86400000

/** 다람쥐에 3단계 그림을 준 팩 (색이 다르게) */
const STAGED = {
  ...BUILTINS,
  ...packFiles('squirrel', {
    name: { ko: '다람쥐' },
    art: JSON.stringify({
      width: 32,
      height: 32,
      idle: fill('aaaaaa'),
      work: [fill('111111')],
      stages: { '3': { idle: fill('cc0000'), work: [fill('cc0001')] } },
    }),
  }),
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
  props: { title: 'dotchi', isFocused: false, bodyColumns: 47, placement: 'dock', scroll: { offset: 0, bodyRows: 50 }, view: {} },
} as const

const setup = (on: On, character: string, show = 'always') => {
  const engine = fakeEngine(on, {
    files: STAGED,
    store: { settings: { character, show, voice: false, lang: 'ko' } },
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  return engine
}
const measure = (percentUsed: number) => ({
  context: { window: 200000 },
  rateLimits: [{ kind: 'seven_day', percentUsed, resetsAt: RESET }],
  changed: ['rateLimits' as const],
})
const cells = async ($: Engine) => {
  const ui = await $.ui.mount(band)
  const found = (await ui.find({ key: 'dots' }))?.props.cells
  await ui.unmount()
  return found
}

test('별', () => {
  expect([1, 2, 3].map(n => stars(n as 1 | 2 | 3))).toEqual(['★☆☆', '★★☆', '★★★'])
})

test('상태 줄은 아이콘 뒤에 별', () => {
  const base = { meter: null, git: { branch: 'main', ahead: null, files: [] as never[] }, artifacts: [], icon: '🌰', mode: 'full' as const, cost: false, elapsedMs: 0, lang: 'ko' as const }
  expect(statusLine({ ...base, stage: 2 })).toBe('🌰 ★★☆ · ⎇ main')
  expect(statusLine(base)).toBe('🌰 ⎇ main')
})

test('3단계가 되면 띠에 3단계 그림', async ($, on) => {
  const { clock } = setup(on, 'squirrel')
  await clock.set(NOW)
  await $.session.start(SESSION)
  const first = await cells($)
  await $.session.measure(measure(70))
  const grown = await cells($)
  expect(grown).not.toEqual(first)
  expect(grown).not.toBe(undefined)
})

test('단계 그림이 없는 펫은 그대로', async ($, on) => {
  const { clock } = setup(on, 'turtle')
  await clock.set(NOW)
  await $.session.start(SESSION)
  const first = await cells($)
  await $.session.measure(measure(70))
  expect(await cells($)).toEqual(first)
})

test('띠에서 쓰다듬으면 하트와 기분 좋은 말, 앨범 재료에 한 번', async ($, on) => {
  const { clock, stored } = setup(on, 'squirrel')
  await clock.set(NOW)
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band)
  await ui.press({ key: 'pat' })
  expect(await ui.find({ type: 'Text', text: /헤헤, 좋아요|더 쓰다듬어 주세요|기분 최고/ })).not.toBe(undefined)
  expect(await ui.find({ type: 'Text', text: '♥' })).not.toBe(undefined)
  expect((stored.grow as { week: { pats: number } }).week.pats).toBe(1)
  await clock.advance(2001)
  expect(await ui.find({ type: 'Text', text: '♥' })).toBe(undefined)
  await ui.unmount()
})

test('옆 패널에 단계 줄과 쓰다듬기', async ($, on) => {
  const { clock, stored } = setup(on, 'squirrel', 'side')
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(40))
  const ui = await $.ui.mount(pane)
  expect(await ui.find({ type: 'Text', text: /★★☆ 2단계/ })).not.toBe(undefined)
  await ui.press({ key: 'pat' })
  expect((stored.grow as { week: { pats: number } }).week.pats).toBe(1)
  await ui.unmount()
})

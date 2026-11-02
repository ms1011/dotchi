import { expect, test } from 'claude-code/testing'
import type { On, PromptSubmitInput } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, SESSION } from './test-kit'

const DAY = 86400000
const RESET = '2026-11-09T00:00:00.000Z'
const NOW = Date.parse(RESET) - 3 * DAY

const band = (isWorking: boolean) =>
  ({
    plugin: 'dotchi',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows: 40, bodyColumns: 100, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

const setup = (on: On, store: Record<string, unknown> = {}) => {
  const engine = fakeEngine(on, {
    files: BUILTINS,
    store: { settings: { character: 'squirrel', show: 'working', voice: false, lang: 'ko' }, ...store },
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  return engine
}

const measure = (percentUsed: number) => ({
  context: { window: 200000 },
  rateLimits: [{ kind: 'seven_day', percentUsed, resetsAt: RESET }],
  changed: ['rateLimits' as const],
})

test('주간 한도 85%면 쉬는 중에도 펫이 나와 말하고, 알림 하나', async ($, on) => {
  const { clock, notified } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(85))
  const ui = await $.ui.mount(band(false))
  expect(await ui.find({ type: 'Text', text: /주간 한도 85%/ })).not.toBe(undefined)
  expect(await ui.find({ key: 'dots' })).not.toBe(undefined)
  expect(notified.length).toBe(1)
  expect(notified[0]!.title).toBe('다람쥐')
  expect(notified[0]!.text).toMatch(/주간 한도 85%/)
  await ui.unmount()
})

test('같은 단계 안에서는 다시 알리지 않는다', async ($, on) => {
  const { clock, notified } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(85))
  await $.session.measure(measure(86))
  expect(notified.length).toBe(1)
})

test('limit off면 알리지 않는다', async ($, on) => {
  const { clock, notified } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await dotchi($, 'limit off')
  await $.session.measure(measure(90))
  expect(notified.length).toBe(0)
})

test('말풍선은 10초 뒤에 사라진다', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(80))
  const ui = await $.ui.mount(band(false))
  expect(await ui.find({ type: 'Text', text: /주간 한도 80%/ })).not.toBe(undefined)
  await clock.advance(10001)
  expect(await ui.find({ type: 'Text', text: /주간 한도/ })).toBe(undefined)
  expect(await ui.find({ key: 'dots' })).toBe(undefined)
  await ui.unmount()
})

test('메시지를 보내면 말풍선이 사라진다', async ($, on) => {
  const { clock } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(80))
  await $.prompt.submit({ text: 'hi' } as PromptSubmitInput)
  const ui = await $.ui.mount(band(false))
  expect(await ui.find({ type: 'Text', text: /주간 한도/ })).toBe(undefined)
  await ui.unmount()
})

test('알린 단계는 저장되어 새 세션에서도 다시 알리지 않는다', async ($, on) => {
  const { clock, notified } = setup(on, {
    limitSeen: { seven_day: { resetsAt: RESET, step: 85 } },
  })
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure(measure(87))
  expect(notified.length).toBe(0)
})

test('리셋 시각을 모르면 리셋 없이 말한다', async ($, on) => {
  const { clock, notified } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure({ ...measure(80), rateLimits: [{ kind: 'seven_day', percentUsed: 80 }] })
  expect(notified[0]!.text).toBe('주간 한도 80%!')
})

test('rateLimits가 바뀌지 않은 측정은 무시한다', async ($, on) => {
  const { clock, notified } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await $.session.measure({ ...measure(90), changed: ['context'] })
  expect(notified.length).toBe(0)
})

test('측정이 동시에 몰려도 같은 단계는 한 번만 알린다', async ($, on) => {
  const { clock, notified } = setup(on)
  await clock.set(NOW)
  await $.session.start(SESSION)
  await Promise.all([$.session.measure(measure(85)), $.session.measure(measure(86))])
  expect(notified.length).toBe(1)
})

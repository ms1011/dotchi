import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, runCommand, SESSION } from './test-kit'

const pane = (bodyColumns = 47, bodyRows = 50) =>
  ({
    plugin: 'dotchi',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'dotchi',
    props: { title: 'dotchi', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows }, view: {} },
  }) as const

const band = {
  plugin: 'dotchi',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 100, scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const setup = (on: On, options: { show?: string; placed?: boolean } = {}) => {
  const engine = fakeEngine(on, {
    files: BUILTINS,
    placed: options.placed,
    store: { settings: { character: 'squirrel', show: options.show ?? 'working', voice: false, lang: null } },
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return engine
}

test('/dotchi show side는 터미널 너비 20%로 옆 패널을 연다', async ($, on) => {
  const engine = setup(on)
  await $.session.start(SESSION)
  const result = await runCommand($, 'dotchi', 'show side', 237)
  expect(result.text).toContain('옆 패널')
  expect(engine.opened.at(-1)).toEqual({ id: 'dotchi', columns: 47 })
})

test('사이드 모드로 저장돼 있으면 세션 시작 때 패널을 연다', async ($, on) => {
  const engine = setup(on, { show: 'side' })
  await $.session.start(SESSION)
  expect(engine.opened.map(o => o.id)).toEqual(['dotchi'])
})

test('패널이 열려 있으면 입력창 위 띠는 숨는다', async ($, on) => {
  setup(on, { show: 'side' })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band)
  expect(await ui.find({ key: 'dots' })).toBe(undefined)
  await ui.unmount()
})

test('패널을 열 수 없으면(좁은 화면) 띠에 그대로 보인다', async ($, on) => {
  setup(on, { show: 'side', placed: false })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band)
  expect(await ui.find({ key: 'dots' })).not.toBe(undefined)
  await ui.unmount()
})

test('패널에는 말풍선이 위, 캐릭터가 아래', async ($, on) => {
  setup(on, { show: 'side' })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(pane())
  const tree = JSON.stringify(await ui.drawn())
  expect(tree.indexOf('다쉼')).toBeGreaterThan(-1)
  expect(tree.indexOf('다쉼')).toBeLessThan(tree.indexOf('"dots"'))
  expect((await ui.find({ key: 'dots' }))?.props.rows).toBe(16)
  await ui.unmount()
})

test('패널이 좁으면 작은 그림', async ($, on) => {
  setup(on, { show: 'side' })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(pane(24, 50))
  expect((await ui.find({ key: 'dots' }))?.props.rows).toBe(8)
  await ui.unmount()
})

test('일하는 동안 패널 그림도 움직인다', async ($, on) => {
  const { clock } = setup(on, { show: 'side' })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(pane())
  const resting = (await ui.find({ key: 'dots' }))?.props.cells
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const first = (await ui.find({ key: 'dots' }))?.props.cells
  await clock.advance(250)
  const second = (await ui.find({ key: 'dots' }))?.props.cells
  expect(first).not.toEqual(resting)
  expect(second).not.toEqual(first)
  expect(await ui.find({ type: 'Text', text: /다일[12]/ })).not.toBe(undefined)
  await ui.unmount()
})

test('다른 모드로 바꾸면 패널을 닫는다', async ($, on) => {
  const engine = setup(on, { show: 'side' })
  await $.session.start(SESSION)
  await runCommand($, 'dotchi', 'show working')
  expect(engine.closed).toEqual(['dotchi'])
})

test('패널이 닫혀 있으면 /dotchi show side로 다시 연다', async ($, on) => {
  const engine = setup(on, { show: 'side', placed: false })
  await $.session.start(SESSION)
  await runCommand($, 'dotchi', 'show side', 237)
  expect(engine.opened.map(o => o.columns)).toEqual([48, 47])
})

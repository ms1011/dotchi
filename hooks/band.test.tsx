import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Frame } from '../types'
import { artJson, BUILTINS, dotchi, fakeEngine, fill, lineSet, packFiles, SESSION } from './test-kit'
import type { Files } from './test-kit'

const band = (isWorking: boolean, maxRows = 40, bodyColumns = 100) =>
  ({
    plugin: 'dotchi',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  }) as const

const setup = (on: On, options: { files?: Files; show?: 'always' | 'working' } = {}) => {
  const engine = fakeEngine(on, {
    files: options.files ?? BUILTINS,
    store: { settings: { character: 'squirrel', show: options.show ?? 'always', voice: false, lang: null } },
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return engine
}

const cellsOf = async (ui: { find: (q: { key: string }) => Promise<{ props: Record<string, unknown> } | undefined> }) =>
  (await ui.find({ key: 'dots' }))?.props.cells

test('일할 때만 모드에서 쉬는 중이면 아무것도 안 그린다', async ($, on) => {
  setup(on, { show: 'working' })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(false))
  expect(await ui.find({ key: 'dots' })).toBe(undefined)
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('항상 모드에서 쉬는 중이면 멈춘 그림과 쉬는 문구', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(false))
  expect((await ui.find({ key: 'dots' }))?.props.rows).toBe(16)
  expect(await ui.find({ type: 'Text', text: /다쉼[12]/ })).not.toBe(undefined)
  await ui.unmount()
})

test('일하는 중에는 tick마다 다른 컷과 일하는 문구', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band(true))
  const first = await cellsOf(ui)
  await clock.advance(250)
  expect(await cellsOf(ui)).not.toEqual(first)
  expect(await ui.find({ type: 'Text', text: /다일[12]/ })).not.toBe(undefined)
  await ui.unmount()
})

test('전체 화면에서 띠에 10줄 남으면 작은 그림', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount({ ...band(false, 10), viewport: { columns: 100, rows: 40, isFullscreen: true } })
  expect((await ui.find({ key: 'dots' }))?.props.rows).toBe(8)
  await ui.unmount()
})

test('전체 화면이 아니면 터미널 높이 24줄에서 작은 그림', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount({ ...band(false, 24), viewport: { columns: 100, rows: 24, isFullscreen: false } })
  expect((await ui.find({ key: 'dots' }))?.props.rows).toBe(8)
  await ui.unmount()
})

test('Esc로 중단된 턴도 타이머가 멈춘다', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(true))
  const resting = await cellsOf(ui)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await clock.advance(500)
  await $.turn.complete({ answer: '', durationMs: 500, isAborted: true, turnId: 't1', reason: 'aborted' })
  expect(await cellsOf(ui)).toEqual(resting)
  await clock.advance(1000)
  expect(await cellsOf(ui)).toEqual(resting)
  await ui.unmount()
})

test('서브에이전트 턴은 메인 타이머를 건드리지 않는다', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(true))
  const resting = await cellsOf(ui)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'x', durationMs: 1, isAborted: false, turnId: 's1', agentId: 'a1', reason: 'answer' })
  await clock.advance(250)
  expect(await cellsOf(ui)).not.toEqual(resting)
  await ui.unmount()
})

test('캐릭터를 바꾸면 그 팩을 다시 읽는다', async ($, on) => {
  const engine = setup(on)
  await $.session.start(SESSION)
  const before = engine.reads.filter(p => p.endsWith('characters/turtle/art.json')).length
  await dotchi($, 'turtle')
  expect(engine.reads.filter(p => p.endsWith('characters/turtle/art.json')).length).toBeGreaterThan(before)
})

test('말풍선은 그림 오른쪽 위에 있고 꼬리가 두 줄', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(false))
  expect(JSON.stringify(await ui.drawn())).toContain('"alignItems":"flex-start"')
  expect((await ui.findAll({ type: 'Text', text: /╱/ })).length).toBe(2)
  await ui.unmount()
})

test('비어 있는 양옆 칸을 잘라 말풍선을 머리에 붙인다', async ($, on) => {
  const narrow: Frame = Array.from({ length: 32 }, () => Array.from({ length: 32 }, (_, x) => (x >= 6 && x <= 25 ? '111111' : null)))
  setup(on, { files: packFiles('squirrel', { art: artJson(narrow, [narrow]), lines: { ko: lineSet('다') } }) })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(false))
  expect((await ui.find({ key: 'dots' }))?.props.columns).toBe(20)
  await ui.unmount()
})

test('팩이 하나도 없으면 그림 없이 말풍선만, 죽지 않는다', async ($, on) => {
  setup(on, { files: { 'tools/x': '' } })
  await $.session.start(SESSION)
  const ui = await $.ui.mount(band(false))
  expect(await ui.find({ key: 'dots' })).toBe(undefined)
  await ui.unmount()
  void fill
})

const speedy = (frameMs?: number) =>
  packFiles('squirrel', { frameMs, lines: { ko: { spinner: ['첫말', '둘째말'], idle: ['쉼'], ending: ['끝'] } } })

test('frameMs 120 팩은 120ms 뒤 컷이 바뀐다', async ($, on) => {
  const { clock } = setup(on, { files: speedy(120) })
  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band(true))
  const first = await cellsOf(ui)
  await clock.advance(120)
  expect(await cellsOf(ui)).not.toEqual(first)
  await ui.unmount()
})

test('기본 속도 팩은 120ms로는 컷이 안 바뀐다', async ($, on) => {
  const { clock } = setup(on, { files: speedy() })
  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band(true))
  const first = await cellsOf(ui)
  await clock.advance(120)
  expect(await cellsOf(ui)).toEqual(first)
  await ui.unmount()
})

test('빠른 팩도 문구는 3초마다 바뀐다', async ($, on) => {
  const { clock } = setup(on, { files: speedy(120) })
  await $.session.start(SESSION)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  const ui = await $.ui.mount(band(true))
  const words = async () => (await ui.find({ type: 'Text', text: /말$/ }))?.text
  const first = await words()
  await clock.advance(120 * 24)
  expect(await words()).toBe(first)
  await clock.advance(120)
  expect(await words()).not.toBe(first)
  await ui.unmount()
})

import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, lineSet, packFiles, SESSION } from './test-kit'
import type { Files } from './test-kit'

const SPINNER = {
  plugin: 'dotchi',
  surface: 'terminal',
  component: 'Spinner',
  props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' },
} as const

const setup = (on: On, files: Files = BUILTINS) => {
  fakeEngine(on, { files })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const word = e.component === 'Spinner' ? (e.props as { word: string }).word : 'engine'
    return <Text>{word}</Text>
  })
}

test('스피너 단어가 캐릭터 문구로 바뀐다', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const ui = await $.ui.mount(SPINNER)
  expect(await ui.find({ type: 'Text', text: /^다일[12]$/ })).not.toBe(undefined)
  await ui.unmount()
})

test('캐릭터를 바꾸면 그 캐릭터 문구', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'turtle')
  const ui = await $.ui.mount(SPINNER)
  expect(await ui.find({ type: 'Text', text: /^거일[12]$/ })).not.toBe(undefined)
  await ui.unmount()
})

test('대사가 비어 있으면 스피너를 건드리지 않는다', async ($, on) => {
  setup(on, packFiles('squirrel', { lines: { ko: { spinner: [], idle: [], ending: [] } } }))
  await $.session.start(SESSION)
  const ui = await $.ui.mount(SPINNER)
  expect((await ui.find({ type: 'Text', text: /Sauteing/ }))?.text).toBe('Sauteing')
  await ui.unmount()
  void lineSet
})

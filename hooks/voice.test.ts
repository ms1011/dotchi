import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, packFiles, SESSION } from './test-kit'
import type { Files } from './test-kit'

const ANSWER = { answer: '답변입니다', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as const

const setup = (on: On, voice: boolean, files: Files = BUILTINS) => {
  fakeEngine(on, { files, store: { settings: { character: 'squirrel', show: 'working', voice, lang: null } } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
}

test('voice 꺼짐이면 답변 그대로', async ($, on) => {
  setup(on, false)
  await $.session.start(SESSION)
  expect((await $.turn.complete(ANSWER)).text).toBe('답변입니다')
})

test('voice 켜짐 + 정상 답변이면 한마디', async ($, on) => {
  setup(on, false)
  await $.session.start(SESSION)
  await dotchi($, 'voice on')
  expect((await $.turn.complete(ANSWER)).text).toBe('다끝')
})

test('중단·오류·빈 답변·서브에이전트는 한마디 없음', async ($, on) => {
  setup(on, true)
  await $.session.start(SESSION)
  const cases = [
    { ...ANSWER, reason: 'aborted', isAborted: true },
    { ...ANSWER, reason: 'error' },
    { ...ANSWER, answer: '   ' },
    { ...ANSWER, agentId: 'a1' },
  ] as const
  for (const input of cases) {
    expect((await $.turn.complete(input)).text).toBe(input.answer)
  }
})

test('한마디 목록이 비면 voice 켜져 있어도 없음', async ($, on) => {
  setup(on, true, packFiles('squirrel', { lines: { ko: { spinner: ['a'], idle: ['b'], ending: [] } } }))
  await $.session.start(SESSION)
  expect((await $.turn.complete(ANSWER)).text).toBe('답변입니다')
})

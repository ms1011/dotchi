import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, SESSION } from './test-kit'

const setup = (on: On) => {
  const engine = fakeEngine(on, {
    files: BUILTINS,
    store: { settings: { character: 'squirrel', show: 'working', voice: false, lang: 'ko' } },
    contextTokens: 62000,
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  return engine
}

test('/dotchi 상태에 한도 경고, 알림, 쉬는 기준이 보인다', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const { text } = await dotchi($, '')
  expect(text).toContain('Now: ')
  expect(text).toContain('Limit warning: on')
  expect(text).toContain('Context: 62k tokens')
  expect(text).toContain('Notifications: on · after 60 s · channel unknown until the first one')
  expect(text).toContain('Rest warning: after 24 h away and 100k tokens')
})

test('끈 항목은 꺼짐으로, 알림 경로는 마지막 결과로', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'limit off')
  await dotchi($, 'rest off')
  await dotchi($, 'notify off')
  const { text } = await dotchi($, '')
  expect(text).toContain('Limit warning: off')
  expect(text).toContain('Notifications: off')
  expect(text).toContain('Rest warning: off')
})

test('긴 답변을 알린 뒤에는 쓴 경로가 보인다', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  await $.turn.complete({ answer: 'a', durationMs: 90000, isAborted: false, turnId: 't', reason: 'answer' })
  expect((await dotchi($, '')).text).toContain('channel iterm2')
})

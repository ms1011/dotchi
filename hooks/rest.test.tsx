import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, PromptEditInput } from 'claude-code'

import { shouldWarnRest } from './rest'
import { BUILTINS, dotchi, fakeEngine, SESSION } from './test-kit'

const HOUR = 3600000
const RULE = { hours: 24, tokens: 100000 }

test('shouldWarnRest 경계', () => {
  expect(shouldWarnRest(0, 23 * HOUR, 150000, RULE)).toBe(false)
  expect(shouldWarnRest(0, 24 * HOUR, 100000, RULE)).toBe(true)
  expect(shouldWarnRest(0, 24 * HOUR, 99999, RULE)).toBe(false)
  expect(shouldWarnRest(null, 100 * HOUR, 150000, RULE)).toBe(false)
  expect(shouldWarnRest(0, 100 * HOUR, undefined, RULE)).toBe(false)
  expect(shouldWarnRest(0, 100 * HOUR, 150000, null)).toBe(false)
})

const setup = (on: On, contextTokens: number | undefined) => {
  const engine = fakeEngine(on, {
    files: BUILTINS,
    store: { settings: { character: 'squirrel', show: 'working', voice: false, lang: 'ko' } },
    contextTokens,
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.edit', (_, e) => ({ text: e.text, cursor: e.cursor }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return engine
}

const answer = { answer: '답변', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const
/** 입력창에 타이핑: 테스트 엔진 타입에는 없지만 prompt.edit 이벤트를 그대로 흘린다 */
const type = ($: Engine, text: string) =>
  ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<{ text: string }> }).edit({
    origin: { kind: 'composer' },
    text,
    cursor: text.length,
    start: 0,
    end: 0,
    inputText: text,
  })

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

test('하루 넘게 쉬고 큰 대화에 타이핑을 시작하면 한 번 말한다', async ($, on) => {
  const { clock } = setup(on, 150000)
  await $.session.start(SESSION)
  await $.turn.complete(answer)
  await clock.advance(25 * HOUR)
  const edited = await type($, 'h')
  expect(edited.text).toBe('h')
  expect(await bubble($)).toMatch(/오랜만이에요! 대화가 커서\(150k\)/)
  await clock.advance(10001)
  await type($, 'hi')
  expect(await bubble($)).toBe(undefined)
})

test('하루가 안 지났으면 말하지 않는다', async ($, on) => {
  const { clock } = setup(on, 150000)
  await $.session.start(SESSION)
  await $.turn.complete(answer)
  await clock.advance(23 * HOUR)
  await type($, 'h')
  expect(await bubble($)).toBe(undefined)
})

test('대화가 작으면 말하지 않는다', async ($, on) => {
  const { clock } = setup(on, 50000)
  await $.session.start(SESSION)
  await $.turn.complete(answer)
  await clock.advance(30 * HOUR)
  await type($, 'h')
  expect(await bubble($)).toBe(undefined)
})

test('rest off면 말하지 않는다', async ($, on) => {
  const { clock } = setup(on, 150000)
  await $.session.start(SESSION)
  await dotchi($, 'rest off')
  await $.turn.complete(answer)
  await clock.advance(30 * HOUR)
  await type($, 'h')
  expect(await bubble($)).toBe(undefined)
})

test('서브에이전트 턴은 마지막 턴 시각을 바꾸지 않는다', async ($, on) => {
  const { clock } = setup(on, 150000)
  await $.session.start(SESSION)
  await $.turn.complete(answer)
  await clock.advance(20 * HOUR)
  await $.turn.complete({ ...answer, agentId: 'a1' })
  await clock.advance(5 * HOUR)
  await type($, 'h')
  expect(await bubble($)).toMatch(/오랜만이에요/)
})

test('마지막 턴 시각은 저장되어 다시 연 세션에서도 쓴다', async ($, on) => {
  const { clock, stored } = setup(on, 150000)
  await clock.set(48 * HOUR)
  stored['lastTurnAt:test-session'] = 0
  await $.session.start(SESSION)
  await type($, 'h')
  expect(await bubble($)).toMatch(/오랜만이에요/)
})

test('다시 연 직후 토큰 수를 아직 모르면 알 수 있을 때 다시 확인한다', async ($, on) => {
  const { clock, usage } = setup(on, undefined)
  await $.session.start(SESSION)
  await $.turn.complete(answer)
  await clock.advance(30 * HOUR)
  await type($, 'h')
  expect(await bubble($)).toBe(undefined)
  usage.contextTokens = 150000
  await type($, 'hi')
  expect(await bubble($)).toMatch(/오랜만이에요/)
})

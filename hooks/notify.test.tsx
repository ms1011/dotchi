import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, UiNotifyResult } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, SESSION } from './test-kit'

const turn = (durationMs: number) =>
  ({ answer: '답변', durationMs, isAborted: false, turnId: 't1', reason: 'answer' }) as const

const setup = (
  on: On,
  options: { notify?: UiNotifyResult; config?: { key: string; value: unknown }[]; configDeny?: boolean } = {},
) => {
  const engine = fakeEngine(on, {
    files: BUILTINS,
    store: { settings: { character: 'squirrel', show: 'working', voice: false, lang: 'ko' } },
    ...options,
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('classic.Notification', () => ({}))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return engine
}

/** 띠를 그려서 지금 말풍선에 뜬 글을 읽는다 (경고가 없으면 '일할 때만' 모드라 아무것도 없다) */
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

const PERMISSION = {
  hook_event_name: 'Notification',
  message: 'Claude needs your permission to use Bash',
  notification_type: 'permission_prompt',
  session_id: 's',
  transcript_path: '/t',
  cwd: '/work',
} as const

test('60초 넘게 걸린 답변은 펫 이름으로 알린다', async ($, on) => {
  const { notified } = setup(on)
  await $.session.start(SESSION)
  await $.turn.complete(turn(61000))
  expect(notified).toEqual([{ text: '다 했어요! (1분 1초)', title: '다람쥐' }])
})

test('60초 안에 끝나면 알리지 않는다', async ($, on) => {
  const { notified } = setup(on)
  await $.session.start(SESSION)
  await $.turn.complete(turn(59000))
  expect(notified.length).toBe(0)
})

test('중단·오류·서브에이전트는 알리지 않는다', async ($, on) => {
  const { notified } = setup(on)
  await $.session.start(SESSION)
  await $.turn.complete({ ...turn(120000), reason: 'aborted', isAborted: true })
  await $.turn.complete({ ...turn(120000), reason: 'error' })
  await $.turn.complete({ ...turn(120000), agentId: 'a1' })
  expect(notified.length).toBe(0)
})

test('notify off면 알리지 않고, after로 기준을 바꾼다', async ($, on) => {
  const { notified } = setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'notify off')
  await $.turn.complete(turn(120000))
  expect(notified.length).toBe(0)
  await dotchi($, 'notify on')
  await dotchi($, 'notify after 300')
  await $.turn.complete(turn(120000))
  expect(notified.length).toBe(0)
  await $.turn.complete(turn(301000))
  expect(notified.length).toBe(1)
})

test('알림 경로가 없으면 펫이 한 번만 고치는 법을 말한다', async ($, on) => {
  const { clock } = setup(on, { notify: { isSent: false, reason: 'no-channel' } })
  await $.session.start(SESSION)
  await $.turn.complete(turn(61000))
  expect(await bubble($)).toMatch(/notify fix/)
  await clock.advance(10001)
  await $.turn.complete(turn(61000))
  expect(await bubble($)).toBe('다 했어요! (1분 1초)')
})

test('사용자가 알림을 꺼 둔 경우(disabled)는 아무 말도 하지 않는다', async ($, on) => {
  setup(on, { notify: { isSent: false, reason: 'disabled' } })
  await $.session.start(SESSION)
  await $.turn.complete(turn(61000))
  expect(await bubble($)).toBe('다 했어요! (1분 1초)')
})

test('승인 대기는 말풍선만: 알림을 하나 더 보내지 않는다', async ($, on) => {
  const { notified } = setup(on)
  await $.session.start(SESSION)
  await $.classic.Notification(PERMISSION)
  expect(await bubble($)).toBe('허락이 필요해요!')
  expect(notified.length).toBe(0)
})

test('다른 종류의 엔진 알림에는 말하지 않는다', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  await $.classic.Notification({ ...PERMISSION, notification_type: 'idle_prompt' })
  expect(await bubble($)).toBe(undefined)
})

test('notify fix는 알림 경로를 iterm2_with_bell로 바꾼다', async ($, on) => {
  const { configRows } = setup(on, { config: [{ key: 'theme', value: 'dark' }, { key: 'notifChannel', value: 'auto' }] })
  await $.session.start(SESSION)
  const { text } = await dotchi($, 'notify fix')
  expect(configRows[1]!.value).toBe('iterm2_with_bell')
  expect(text).toBe('Notifications now use iterm2_with_bell (was auto)')
})

test('notify fix가 바꿀 수 없으면 /config를 안내한다', async ($, on) => {
  setup(on, { config: [{ key: 'theme', value: 'dark' }] })
  await $.session.start(SESSION)
  expect((await dotchi($, 'notify fix')).text).toMatch(/\/config/)
})

test('notify fix가 거절되면 /config를 안내한다', async ($, on) => {
  setup(on, { config: [{ key: 'notifChannel', value: 'auto' }], configDeny: true })
  await $.session.start(SESSION)
  expect((await dotchi($, 'notify fix')).text).toMatch(/\/config/)
})

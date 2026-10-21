import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { detectLang, MESSAGES, t } from './i18n'
import { parseDotchi } from './settings'
import { BUILTINS, dotchi, fakeEngine, SESSION } from './test-kit'

test('detectLang: LC_ALL → LC_MESSAGES → LANG, 네 언어가 아니면 en', () => {
  expect(detectLang({ LANG: 'ko_KR.UTF-8' })).toBe('ko')
  expect(detectLang({ LANG: 'ja_JP.UTF-8' })).toBe('ja')
  expect(detectLang({ LANG: 'zh_TW.UTF-8' })).toBe('zh')
  expect(detectLang({ LANG: 'C' })).toBe('en')
  expect(detectLang({ LANG: 'fr_FR.UTF-8' })).toBe('en')
  expect(detectLang({})).toBe('en')
  expect(detectLang({ LC_ALL: 'ja_JP', LANG: 'ko_KR' })).toBe('ja')
  expect(detectLang({ LC_MESSAGES: 'zh_CN', LANG: 'en_US' })).toBe('zh')
})

test('안내 문구는 영어 하나뿐이고 비어 있지 않다', () => {
  for (const text of Object.values(MESSAGES)) expect(text.trim().length > 0).toBe(true)
  expect(t('status', { name: 'x', show: 'y', voice: 'z' })).toBe('Now: x · Shown: y · One-liner after answers: z')
})

test('t는 {이름} 자리를 채운다', () => {
  expect(t('unknownCharacter', { arg: 'bunny' })).toBe("No character 'bunny'. See /dotchi list")
})

test('parseDotchi lang', () => {
  expect(parseDotchi('lang ja')).toEqual({ kind: 'lang', lang: 'ja' })
  expect(parseDotchi('lang auto')).toEqual({ kind: 'lang', lang: null })
  expect(parseDotchi('lang fr')).toEqual({ kind: 'usage' })
})

const setup = (on: On, env: Record<string, string> = {}) => fakeEngine(on, { files: BUILTINS, env })

test('/dotchi lang ja는 대사·이름 언어만 바꾸고 안내는 영어 그대로 (이름은 일본어가 없으면 영어)', async ($, on) => {
  const { stored } = setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'lang ja')
  expect((stored.settings as { lang: string }).lang).toBe('ja')
  expect((await dotchi($, '')).text).toBe('Now: Squirrel · Shown: while working · One-liner after answers: off')
})

test('lang auto면 대사·이름은 컴퓨터 언어를 따르고, 안내는 어느 언어든 영어', async ($, on) => {
  setup(on, { LANG: 'ko_KR.UTF-8' })
  await $.session.start(SESSION)
  expect((await dotchi($, '')).text).toBe('Now: 다람쥐 · Shown: while working · One-liner after answers: off')
})

test('팩에 지금 언어 대사가 없으면 영어 대사로 말풍선', async ($, on) => {
  fakeEngine(on, { files: BUILTINS, store: { settings: { character: 'squirrel', show: 'always', voice: false, lang: 'ja' } } })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start(SESSION)
  const ui = await $.ui.mount({
    plugin: 'dotchi',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 100, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  expect(await ui.find({ type: 'Text', text: /sq쉼[12]/ })).not.toBe(undefined)
  await ui.unmount()
})

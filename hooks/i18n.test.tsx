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

test('네 언어 모두 같은 문구 키가 있고 비어 있지 않다', () => {
  const keys = Object.keys(MESSAGES.ko).sort()
  for (const lang of ['en', 'ja', 'zh'] as const) {
    expect(Object.keys(MESSAGES[lang]).sort()).toEqual(keys)
  }
  for (const lang of ['ko', 'en', 'ja', 'zh'] as const) {
    for (const key of keys) expect((MESSAGES[lang] as Record<string, string>)[key]!.trim().length > 0).toBe(true)
  }
})

test('t는 {이름} 자리를 채운다', () => {
  expect(t('ko', 'unknownCharacter', { arg: 'bunny' })).toContain("'bunny'")
})

test('parseDotchi lang', () => {
  expect(parseDotchi('lang ja')).toEqual({ kind: 'lang', lang: 'ja' })
  expect(parseDotchi('lang auto')).toEqual({ kind: 'lang', lang: null })
  expect(parseDotchi('lang fr')).toEqual({ kind: 'usage' })
})

const setup = (on: On, env: Record<string, string> = {}) => fakeEngine(on, { files: BUILTINS, env })

test('/dotchi lang ja 후 상태 문구가 일본어, 이름은 일본어가 없으면 영어', async ($, on) => {
  const { stored } = setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'lang ja')
  expect((stored.settings as { lang: string }).lang).toBe('ja')
  expect((await dotchi($, '')).text).toBe(
    t('ja', 'status', { name: 'Squirrel', show: t('ja', 'show.working'), voice: t('ja', 'voiceOff') }),
  )
})

test('lang auto면 컴퓨터 언어를 따른다', async ($, on) => {
  setup(on, { LANG: 'en_US.UTF-8' })
  await $.session.start(SESSION)
  expect((await dotchi($, '')).text).toBe(
    t('en', 'status', { name: 'Squirrel', show: t('en', 'show.working'), voice: t('en', 'voiceOff') }),
  )
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

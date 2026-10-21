import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, normalizeSettings, parseDotchi } from './settings'

test('normalizeSettings는 이상한 값을 기본값으로', () => {
  expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings({ character: 'Bad Id!', show: 'sometimes', voice: 'yes', lang: 'fr' })).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings({ character: 'bunny', show: 'side', voice: true, lang: 'ja' })).toEqual({
    character: 'bunny',
    show: 'side',
    voice: true,
    lang: 'ja',
  })
  expect(DEFAULT_SETTINGS).toEqual({ character: 'squirrel', show: 'working', voice: false, lang: null })
})

test('parseDotchi 하위 명령', () => {
  expect(parseDotchi('')).toEqual({ kind: 'status' })
  expect(parseDotchi(' list ')).toEqual({ kind: 'list' })
  expect(parseDotchi('turtle')).toEqual({ kind: 'switch', target: 'turtle' })
  expect(parseDotchi('거북이')).toEqual({ kind: 'switch', target: '거북이' })
  expect(parseDotchi('show side')).toEqual({ kind: 'show', mode: 'side' })
  expect(parseDotchi('voice on')).toEqual({ kind: 'voice', on: true })
  expect(parseDotchi('voice off')).toEqual({ kind: 'voice', on: false })
})

test('parseDotchi 모르는 모양은 사용법', () => {
  for (const args of ['show sometimes', 'voice maybe', 'list all', 'a b']) {
    expect(parseDotchi(args)).toEqual({ kind: 'usage' })
  }
})

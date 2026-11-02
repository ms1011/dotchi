import { expect, test } from 'claude-code/testing'

import { DEFAULT_SETTINGS, normalizeSettings, parseDotchi, parseTokens } from './settings'

test('normalizeSettings는 이상한 값을 기본값으로', () => {
  expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings('garbage')).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings({ character: 'Bad Id!', show: 'sometimes', voice: 'yes', lang: 'fr' })).toEqual(DEFAULT_SETTINGS)
  expect(normalizeSettings({ character: 'bunny', show: 'side', voice: true, lang: 'ja' })).toEqual({
    ...DEFAULT_SETTINGS,
    character: 'bunny',
    show: 'side',
    voice: true,
    lang: 'ja',
  })
  expect(DEFAULT_SETTINGS).toEqual({
    character: 'squirrel',
    show: 'working',
    voice: false,
    lang: null,
    limit: true,
    notify: true,
    notifyAfterSec: 60,
    rest: { hours: 24, tokens: 100000 },
  })
})

test('0.4.0에 저장된 설정은 새 항목을 기본값으로 채운다', () => {
  const old = normalizeSettings({ character: 'turtle', show: 'side', voice: true, lang: 'ko' })
  expect(old.limit).toBe(true)
  expect(old.notify).toBe(true)
  expect(old.notifyAfterSec).toBe(60)
  expect(old.rest).toEqual({ hours: 24, tokens: 100000 })
})

test('새 항목의 이상한 값은 기본값, 맞는 값은 그대로', () => {
  const bad = normalizeSettings({ limit: 'yes', notify: 1, notifyAfterSec: -1, rest: { hours: 0, tokens: 100000 } })
  expect(bad.limit).toBe(true)
  expect(bad.notify).toBe(true)
  expect(bad.notifyAfterSec).toBe(60)
  expect(bad.rest).toEqual({ hours: 24, tokens: 100000 })
  const good = normalizeSettings({ limit: false, notify: false, notifyAfterSec: 120, rest: null })
  expect(good.limit).toBe(false)
  expect(good.notify).toBe(false)
  expect(good.notifyAfterSec).toBe(120)
  expect(good.rest).toBe(null)
  expect(normalizeSettings({ rest: { hours: 48, tokens: 50000 } }).rest).toEqual({ hours: 48, tokens: 50000 })
})

test('parseTokens', () => {
  expect(parseTokens('100k')).toBe(100000)
  expect(parseTokens('1.5m')).toBe(1500000)
  expect(parseTokens('1.5M')).toBe(1500000)
  expect(parseTokens('80000')).toBe(80000)
  expect(parseTokens('lots')).toBe(null)
  expect(parseTokens('')).toBe(null)
})

test('parseDotchi 하위 명령', () => {
  expect(parseDotchi('')).toEqual({ kind: 'status' })
  expect(parseDotchi(' list ')).toEqual({ kind: 'list' })
  expect(parseDotchi('turtle')).toEqual({ kind: 'switch', target: 'turtle' })
  expect(parseDotchi('거북이')).toEqual({ kind: 'switch', target: '거북이' })
  expect(parseDotchi('show side')).toEqual({ kind: 'show', mode: 'side' })
  expect(parseDotchi('voice on')).toEqual({ kind: 'voice', on: true })
  expect(parseDotchi('voice off')).toEqual({ kind: 'voice', on: false })
  expect(parseDotchi('limit off')).toEqual({ kind: 'limit', on: false })
  expect(parseDotchi('limit on')).toEqual({ kind: 'limit', on: true })
  expect(parseDotchi('notify on')).toEqual({ kind: 'notify', on: true })
  expect(parseDotchi('notify off')).toEqual({ kind: 'notify', on: false })
  expect(parseDotchi('notify fix')).toEqual({ kind: 'notifyFix' })
  expect(parseDotchi('notify after 120')).toEqual({ kind: 'notifyAfter', seconds: 120 })
  expect(parseDotchi('rest 24 100k')).toEqual({ kind: 'rest', rest: { hours: 24, tokens: 100000 } })
  expect(parseDotchi('rest off')).toEqual({ kind: 'rest', rest: null })
})

test('parseDotchi 모르는 모양은 사용법', () => {
  for (const args of ['show sometimes', 'voice maybe', 'list all', 'a b', 'rest 24', 'rest 0 100k', 'rest 24 lots', 'notify after x', 'notify after 2', 'notify maybe', 'limit maybe']) {
    expect(parseDotchi(args)).toEqual({ kind: 'usage' })
  }
})

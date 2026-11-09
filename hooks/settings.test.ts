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
    line: 'full',
    cost: false,
    gauge: { context: { warn: 70, danger: 90 }, week: { warn: 80, danger: 95 } },
    theme: 'pastel',
    grow: { reset: true, budgetUsd: null },
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

test('상태 줄 설정: 모양과 비용', () => {
  expect(parseDotchi('line full')).toEqual({ kind: 'line', mode: 'full' })
  expect(parseDotchi('line mini')).toEqual({ kind: 'line', mode: 'mini' })
  expect(parseDotchi('line off')).toEqual({ kind: 'line', mode: 'off' })
  expect(parseDotchi('line cost on')).toEqual({ kind: 'lineCost', on: true })
  expect(parseDotchi('line cost off')).toEqual({ kind: 'lineCost', on: false })
  for (const bad of ['line', 'line big', 'line cost', 'line cost maybe', 'line full now']) {
    expect(parseDotchi(bad)).toEqual({ kind: 'usage' })
  }
  expect(normalizeSettings({ line: 'mini', cost: true })).toEqual({ ...DEFAULT_SETTINGS, line: 'mini', cost: true })
  expect(normalizeSettings({ line: 'huge', cost: 'yes' })).toEqual(DEFAULT_SETTINGS)
})

test('게이지 기준: 주의 < 위험, 1~100 정수. reset은 기본값으로', () => {
  expect(DEFAULT_SETTINGS.gauge).toEqual({ context: { warn: 70, danger: 90 }, week: { warn: 80, danger: 95 } })
  expect(parseDotchi('line context 60 85')).toEqual({ kind: 'gauge', target: 'context', at: { warn: 60, danger: 85 } })
  expect(parseDotchi('line week 70 90')).toEqual({ kind: 'gauge', target: 'week', at: { warn: 70, danger: 90 } })
  expect(parseDotchi('line context reset')).toEqual({ kind: 'gauge', target: 'context', at: { warn: 70, danger: 90 } })
  expect(parseDotchi('line week reset')).toEqual({ kind: 'gauge', target: 'week', at: { warn: 80, danger: 95 } })
  for (const bad of ['line context 90 70', 'line context 70 70', 'line context 0 50', 'line week 50 101', 'line week 5.5 9', 'line context 60', 'line tokens 1 2']) {
    expect(parseDotchi(bad)).toEqual({ kind: 'usage' })
  }
  const saved = { gauge: { context: { warn: 60, danger: 85 }, week: { warn: 90, danger: 80 } } }
  // 망가진 쪽만 기본값으로
  expect(normalizeSettings(saved).gauge).toEqual({ context: { warn: 60, danger: 85 }, week: { warn: 80, danger: 95 } })
})

test('/dotchi theme 하위 명령', () => {
  expect(parseDotchi('theme')).toEqual({ kind: 'themeList' })
  expect(parseDotchi('theme list')).toEqual({ kind: 'themeList' })
  expect(parseDotchi('theme candy')).toEqual({ kind: 'themeSwitch', target: 'candy' })
  expect(parseDotchi('theme new')).toEqual({ kind: 'themeNew', idea: null })
  expect(parseDotchi('theme new 바다 느낌, 파란색 위주')).toEqual({ kind: 'themeNew', idea: '바다 느낌, 파란색 위주' })
  expect(parseDotchi('theme edit')).toEqual({ kind: 'themeEdit', target: null })
  expect(parseDotchi('theme edit candy')).toEqual({ kind: 'themeEdit', target: 'candy' })
  expect(parseDotchi('theme set color.ok #ff8fa3')).toEqual({ kind: 'themeSet', key: 'color.ok', value: '#ff8fa3' })
  expect(parseDotchi('theme set face.ok ( ^ω^ )')).toEqual({ kind: 'themeSet', key: 'face.ok', value: '( ^ω^ )' })
  expect(parseDotchi('theme set hearts 🍬 ·')).toEqual({ kind: 'themeSet', key: 'hearts', value: '🍬 ·' })
  expect(parseDotchi('theme install ~/t.theme.json', '/h')).toEqual({ kind: 'themeInstall', path: '/h/t.theme.json', raw: '~/t.theme.json' })
  expect(parseDotchi('theme install candy')).toEqual({ kind: 'themeInstall', path: 'candy', raw: 'candy' })
  expect(parseDotchi('theme export candy')).toEqual({ kind: 'themeExport', target: 'candy' })
  expect(parseDotchi('theme share candy')).toEqual({ kind: 'themeShare', target: 'candy', as: null })
  expect(parseDotchi('theme share candy --as candy-2')).toEqual({ kind: 'themeShare', target: 'candy', as: 'candy-2' })
  expect(parseDotchi('theme unshare candy')).toEqual({ kind: 'themeUnshare', target: 'candy' })
  expect(parseDotchi('theme remove candy')).toEqual({ kind: 'themeRemove', target: 'candy' })
  for (const bad of ['theme set', 'theme set color.ok', 'theme install', 'theme export', 'theme share', 'theme candy now', 'theme edit a b']) {
    expect(parseDotchi(bad)).toEqual({ kind: 'usage' })
  }
  expect(normalizeSettings({ theme: 'candy' }).theme).toBe('candy')
  expect(normalizeSettings({ theme: 'Bad!' }).theme).toBe('pastel')
})

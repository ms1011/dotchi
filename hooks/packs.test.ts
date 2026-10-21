import { expect, test } from 'claude-code/testing'

import { frameMsOf, nameOf, parseLines, parseMeta, pickLines, ticksPerLine } from './packs'

const meta = (over: Record<string, unknown>) => JSON.stringify({ format: 1, id: 'squirrel', name: '다람쥐', ...over })
const set = (p: string) => ({ spinner: [`${p}1`], idle: [`${p}2`], ending: [`${p}3`] })

test('parseMeta 규칙', () => {
  expect(parseMeta(meta({}))?.id).toBe('squirrel')
  expect(parseMeta(meta({ name: { ko: '다람쥐', en: 'Squirrel' }, frameMs: 120 }))?.frameMs).toBe(120)
  for (const bad of [{ id: 'Bunny' }, { id: 'list' }, { id: '' }, { id: 'a'.repeat(33) }, { format: 2 }, { frameMs: 30 }, { frameMs: 2000 }, { name: '' }, { name: {} }, { name: { fr: 'x' } }]) {
    expect(parseMeta(meta(bad))).toBe(null)
  }
  expect(parseMeta('{')).toBe(null)
})

test('parseLines는 언어별 목록, 빈 항목은 버리고 모르는 언어는 무시', () => {
  const lines = parseLines(JSON.stringify({ ko: { ...set('k'), spinner: ['', 'a'] }, fr: set('f') }))
  expect(lines?.ko?.spinner).toEqual(['a'])
  expect(lines && 'fr' in lines).toBe(false)
  expect(parseLines(JSON.stringify({ fr: set('f') }))).toBe(null)
  expect(parseLines(JSON.stringify({ ko: { spinner: '야하', idle: [], ending: [] } }))).toBe(null)
  expect(parseLines('{')).toBe(null)
})

test('nameOf: 지금 언어 → 영어 → 첫 언어 → id', () => {
  const m = parseMeta(meta({ name: { ja: 'リス', en: 'Squirrel' } }))!
  expect(nameOf(m, 'ja')).toBe('リス')
  expect(nameOf(m, 'ko')).toBe('Squirrel')
  expect(nameOf(parseMeta(meta({ name: { zh: '松鼠' } }))!, 'ko')).toBe('松鼠')
  expect(nameOf(parseMeta(meta({}))!, 'en')).toBe('다람쥐')
})

test('pickLines: 지금 언어 → 영어 → 첫 언어, 없으면 빈 목록', () => {
  expect(pickLines({ ko: set('k'), en: set('e') }, 'ko').spinner).toEqual(['k1'])
  expect(pickLines({ ko: set('k'), en: set('e') }, 'ja').spinner).toEqual(['e1'])
  expect(pickLines({ zh: set('z') }, 'ko').spinner).toEqual(['z1'])
  expect(pickLines({}, 'ko')).toEqual({ spinner: [], idle: [], ending: [] })
})

test('frameMsOf 기본 250, ticksPerLine은 3초', () => {
  expect(frameMsOf(parseMeta(meta({}))!)).toBe(250)
  expect(frameMsOf(parseMeta(meta({ frameMs: 110 }))!)).toBe(110)
  expect(ticksPerLine(250)).toBe(12)
  expect(ticksPerLine(120)).toBe(25)
  expect(ticksPerLine(1000)).toBe(3)
})

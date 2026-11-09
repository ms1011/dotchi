import { expect, test } from 'claude-code/testing'

import { isId } from './packs'
import { normalizeSettings, parseDotchi, parseUsd } from './settings'

test('grow 명령', () => {
  expect(parseDotchi('grow')).toEqual({ kind: 'grow' })
  expect(parseDotchi('grow reset off')).toEqual({ kind: 'growReset', on: false })
  expect(parseDotchi('grow reset on')).toEqual({ kind: 'growReset', on: true })
  expect(parseDotchi('grow budget 20')).toEqual({ kind: 'growBudget', usd: 20 })
  expect(parseDotchi('grow budget $12.5')).toEqual({ kind: 'growBudget', usd: 12.5 })
  expect(parseDotchi('grow budget off')).toEqual({ kind: 'growBudget', usd: null })
  expect(parseDotchi('album')).toEqual({ kind: 'album' })
  expect(parseDotchi('evolve turtle')).toEqual({ kind: 'evolve', target: 'turtle' })
})

test('grow 명령의 잘못된 꼴은 사용법', () => {
  for (const bad of ['grow reset maybe', 'grow budget -3', 'grow budget', 'grow budget 0', 'grow nope', 'evolve', 'evolve a b', 'album x']) {
    expect(parseDotchi(bad)).toEqual({ kind: 'usage' })
  }
})

test('parseUsd', () => {
  expect(parseUsd('20')).toBe(20)
  expect(parseUsd('$20')).toBe(20)
  expect(parseUsd('12.5')).toBe(12.5)
  for (const bad of ['0', '-1', 'abc', '$', '1000001', '1e3']) expect(parseUsd(bad)).toBe(null)
})

test('grow 설정은 망가진 칸만 기본값', () => {
  expect(normalizeSettings({ grow: { reset: false } }).grow).toEqual({ reset: false, budgetUsd: null })
  expect(normalizeSettings({ grow: { reset: 'no', budgetUsd: 30 } }).grow).toEqual({ reset: true, budgetUsd: 30 })
  expect(normalizeSettings({ grow: { budgetUsd: -5 } }).grow).toEqual({ reset: true, budgetUsd: null })
  expect(normalizeSettings({ grow: 'x' }).grow).toEqual({ reset: true, budgetUsd: null })
})

test('grow·album·evolve는 펫 id로 못 쓴다', () => {
  for (const word of ['grow', 'album', 'evolve']) expect(isId(word)).toBe(false)
})

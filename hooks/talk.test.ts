import { expect, test } from 'claude-code/testing'

import type { Lang } from '../types'
import { duration, say, TALK, tokens, when } from './talk'

const LANGS: Lang[] = ['ko', 'en', 'ja', 'zh']

test('모든 말이 네 언어에 다 있다', () => {
  const keys = Object.keys(TALK.ko)
  for (const lang of LANGS) {
    expect(Object.keys(TALK[lang]).sort()).toEqual([...keys].sort())
    for (const key of keys) expect(TALK[lang][key as keyof typeof TALK.ko].length > 0).toBe(true)
  }
})

test('say는 자리를 채운다', () => {
  expect(say('ko', 'limit', { percent: '85', reset: '월 09:00' })).toBe('주간 한도 85%! (월 09:00 리셋)')
  expect(say('ko', 'done', { duration: '3분 12초' })).toBe('다 했어요! (3분 12초)')
  expect(say('ko', 'more', { n: '12' })).toBe('+12개 더')
  expect(say('en', 'files', { n: '3' })).toBe('3 files')
})

test('duration', () => {
  expect(duration('ko', 192000)).toBe('3분 12초')
  expect(duration('en', 192000)).toBe('3m 12s')
  expect(duration('ja', 192000)).toBe('3分12秒')
  expect(duration('ko', 45000)).toBe('45초')
  expect(duration('en', 3720000)).toBe('1h 2m')
})

test('tokens', () => {
  expect(tokens(180000)).toBe('180k')
  expect(tokens(1234567)).toBe('1.2M')
  expect(tokens(950)).toBe('950')
})

test('when은 요일과 시:분', () => {
  // 2026-11-02 월요일 09:05 (현지 시각)
  const at = new Date(2026, 10, 2, 9, 5).getTime()
  expect(when('ko', at)).toBe('월 09:05')
  expect(when('en', at)).toBe('Mon 09:05')
  expect(when('ja', at)).toBe('月 09:05')
  expect(when('zh', at)).toBe('周一 09:05')
})

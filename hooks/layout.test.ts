import { expect, test } from 'claude-code/testing'

import { bandLayout } from './layout'

test('전체 화면: maxRows가 띠에 남은 줄 수', () => {
  expect(bandLayout(16, 48, 'terminal', true)).toBe('large')
  expect(bandLayout(15, 48, 'terminal', true)).toBe('small')
  expect(bandLayout(16, 47, 'terminal', true)).toBe('small')
  expect(bandLayout(8, 28, 'terminal', true)).toBe('small')
  expect(bandLayout(7, 28, 'terminal', true)).toBe('text')
  expect(bandLayout(8, 27, 'terminal', true)).toBe('text')
  expect(bandLayout(40, 200, 'desktop', true)).toBe('text')
})

test('전체 화면이 아니면 maxRows는 터미널 높이: 입력창·스피너 자리를 남긴다', () => {
  expect(bandLayout(40, 100, 'terminal', false)).toBe('large')
  expect(bandLayout(39, 100, 'terminal', false)).toBe('small')
  expect(bandLayout(24, 100, 'terminal', false)).toBe('small')
  expect(bandLayout(23, 100, 'terminal', false)).toBe('text')
})

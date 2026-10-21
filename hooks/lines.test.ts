import { expect, test } from 'claude-code/testing'

import type { LineSet } from '../types'
import { endingLine, idleLine, spinnerLine } from './lines'

const set: LineSet = { spinner: ['a', 'b', 'c'], idle: ['x', 'y'], ending: ['야하!'] }
const empty: LineSet = { spinner: [], idle: [], ending: [] }

test('spinnerLine은 3초(12틱)마다 바뀐다', () => {
  expect(spinnerLine(set, '다람쥐', 0, 0)).toBe('a')
  expect(spinnerLine(set, '다람쥐', 11, 0)).toBe('a')
  expect(spinnerLine(set, '다람쥐', 12, 0)).toBe('b')
  expect(spinnerLine(set, '다람쥐', 36, 0)).toBe('a')
  expect(spinnerLine(set, '다람쥐', 0, 2)).toBe('c')
})

test('idleLine과 endingLine', () => {
  expect(idleLine(set, '다람쥐', 3)).toBe('y')
  expect(endingLine(set, 0.99)).toBe('야하!')
})

test('목록이 비면 이름으로 대신한다', () => {
  expect(spinnerLine(empty, '다람쥐', 5, 1)).toBe('다람쥐')
  expect(idleLine(empty, '다람쥐', 1)).toBe('다람쥐')
  expect(endingLine(empty, 0.5)).toBe(null)
})

test('perLine으로 문구가 바뀌는 틱 수를 정한다', () => {
  expect(spinnerLine(set, '다람쥐', 24, 0, 25)).toBe('a')
  expect(spinnerLine(set, '다람쥐', 25, 0, 25)).toBe('b')
})

import { expect, test } from 'claude-code/testing'

import { addArtifact, gitLines, parseArtifacts } from './info'

const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'].map(path => ({ code: 'M' as const, path }))
const git = { branch: 'main', ahead: 0, files }

test('줄이 모자라면 앞의 몇 개와 +n개 더', () => {
  expect(gitLines(git, new Set(), 40, 4, 'ko')).toEqual(['⎇ main', 'M a.ts', 'M b.ts', '+3개 더'])
  expect(gitLines(git, new Set(), 40, 10, 'ko').length).toBe(6)
})

test('깨끗하면 브랜치와 깨끗해요', () => {
  expect(gitLines({ ...git, files: [] }, new Set(), 40, 10, 'en')).toEqual(['⎇ main', 'All clean'])
})

test('아티팩트 목록: 같은 주소는 하나만, 최근 것이 앞, 이상한 저장값은 버린다', () => {
  const list = addArtifact(addArtifact([], { url: 'a', title: 'A' }), { url: 'b', title: 'B' })
  expect(addArtifact(list, { url: 'a', title: 'A2' })).toEqual([{ url: 'a', title: 'A2' }, { url: 'b', title: 'B' }])
  expect(parseArtifacts([{ url: 'a', title: 'A' }, { url: 1 }, 'x'])).toEqual([{ url: 'a', title: 'A' }])
  expect(parseArtifacts('garbage')).toEqual([])
})

test('자리가 한 줄뿐이면 파일 수만', () => {
  expect(gitLines(git, new Set(), 40, 2, 'ko')).toEqual(['⎇ main', '파일 5개'])
})

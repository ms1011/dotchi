import { expect, test } from 'claude-code/testing'

import { orderFiles, parseStatus, shortPath } from './gitstat'

const SAMPLE = [
  '# branch.oid b627813a1105cfa0224477de15ff89c7d549315e',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -0',
  '1 .M N... 100644 100644 100644 7898 7898 hooks/a.ts',
  '1 D. N... 100644 000000 000000 6178 0000 b.ts',
  '2 R. N... 100644 100644 100644 f2ad f2ad R100 d.ts\tc.ts',
  '1 A. N... 000000 100644 100644 0000 b478 s.ts',
  'u UU N... 100644 100644 100644 100644 1 2 3 conflict.ts',
  '? new file.txt',
  '? "quoted\\tname"',
  '',
].join('\n')

test('브랜치와 앞선 커밋 수, 파일 상태', () => {
  const state = parseStatus(SAMPLE)
  expect(state.branch).toBe('main')
  expect(state.ahead).toBe(2)
  expect(state.files).toEqual([
    { code: 'M', path: 'hooks/a.ts' },
    { code: 'D', path: 'b.ts' },
    { code: 'R', path: 'd.ts' },
    { code: 'A', path: 's.ts' },
    { code: 'M', path: 'conflict.ts' },
    { code: '?', path: 'new file.txt' },
    { code: '?', path: 'quoted\\tname' },
  ])
})

test('upstream이 없으면 ahead는 null', () => {
  expect(parseStatus('# branch.oid abc\n# branch.head feature\n').ahead).toBe(null)
})

test('detached HEAD', () => {
  expect(parseStatus('# branch.oid abc\n# branch.head (detached)\n').branch).toBe('(detached)')
})

test('깨끗하면 파일이 없다', () => {
  expect(parseStatus('# branch.head main\n# branch.ab +0 -0\n')).toEqual({ branch: 'main', ahead: 0, files: [] })
})

test('shortPath는 파일 이름을 살리고 앞을 줄인다', () => {
  expect(shortPath('hooks/a.ts', 20)).toBe('hooks/a.ts')
  expect(shortPath('docs/superpowers/specs/design.md', 20)).toBe('…/specs/design.md')
  expect(shortPath('a/very-long-file-name-here.tsx', 12)).toBe('…me-here.tsx')
})

test('orderFiles: Claude가 고친 파일 먼저, 그다음 경로순', () => {
  const files = [
    { code: 'M' as const, path: 'z.ts' },
    { code: 'M' as const, path: 'a.ts' },
    { code: '?' as const, path: 'm.ts' },
  ]
  expect(orderFiles(files, new Set(['m.ts'])).map(f => f.path)).toEqual(['m.ts', 'a.ts', 'z.ts'])
})

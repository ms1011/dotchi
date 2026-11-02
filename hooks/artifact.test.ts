import { expect, test } from 'claude-code/testing'

import { artifactOf } from './info'

test('artifactOf: 객체, 글, {text}, 별도 글에서 주소를 찾는다', () => {
  expect(artifactOf({ url: 'https://x/y', title: 'T' }, undefined, undefined)).toEqual({ url: 'https://x/y', title: 'T' })
  expect(artifactOf('ok https://claude.ai/artifact/a1b2 done', undefined, '/w/page.html')).toEqual({
    url: 'https://claude.ai/artifact/a1b2',
    title: 'page.html',
  })
  expect(artifactOf({ text: 'https://claude.ai/code/artifact/zz9' }, undefined, undefined)?.url).toBe(
    'https://claude.ai/code/artifact/zz9',
  )
  expect(artifactOf({}, 'see https://claude.ai/artifact/q)', undefined)?.url).toBe('https://claude.ai/artifact/q')
  expect(artifactOf({ done: true }, undefined, undefined)).toBe(null)
  expect(artifactOf(undefined, undefined, undefined)).toBe(null)
})

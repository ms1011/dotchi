import { expect, test } from 'claude-code/testing'

import { remoteIdOf, SITE } from './share'
import { BUILTINS, dotchi, fakeEngine, packFiles, SESSION } from './test-kit'
import type { Files } from './test-kit'

/** 사이트가 돌려줄 팩 세 파일: URL → 내용 */
const onSite = (id: string, files: Files) =>
  Object.fromEntries(
    ['dotchi.json', 'art.json', 'lines.json'].map(name => [
      `${SITE}/packs/${id}/${name}`,
      { status: 200, text: files[`characters/${id}/${name}`]! },
    ]),
  )

test('remoteIdOf', () => {
  expect(remoteIdOf('my-cat')).toBe('my-cat')
  expect(remoteIdOf('https://ms1011.github.io/dotchi-packs/?pet=my-cat')).toBe('my-cat')
  expect(remoteIdOf('https://ms1011.github.io/dotchi-packs/?lang=ja&pet=my-cat')).toBe('my-cat')
  expect(remoteIdOf('https://ms1011.github.io/dotchi-packs/packs/my-cat/')).toBe('my-cat')
  expect(remoteIdOf('https://evil.example/?pet=my-cat')).toBe(null)
  expect(remoteIdOf('https://ms1011.github.io/other/?pet=my-cat')).toBe(null)
  expect(remoteIdOf('./my-cat.zip')).toBe(null)
  expect(remoteIdOf('list')).toBe(null)
  expect(remoteIdOf('My Cat')).toBe(null)
  expect(remoteIdOf('https://ms1011.github.io/dotchi-packs/?pet=..%2Fx')).toBe(null)
})

test('install <id>: 사이트에서 세 JSON을 받아 설치하고 tmp를 지운다', async ($, on) => {
  const engine = fakeEngine(on, { http: onSite('bunny', packFiles('bunny', { name: '토끼' })) })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install bunny')).text).toContain('토끼 (bunny)')
  expect(engine.fetched).toContain(`${SITE}/packs/bunny/art.json`)
  expect(Object.keys(engine.files)).toContain('data/characters/bunny/art.json')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/tmp/'))).toBe(false)
})

test('install <사이트 URL>도 같다', async ($, on) => {
  const engine = fakeEngine(on, { http: onSite('bunny', packFiles('bunny', { name: '토끼' })) })
  await $.session.start(SESSION)
  expect((await dotchi($, `install ${SITE}/?pet=bunny`)).text).toContain('토끼 (bunny)')
  expect(Object.keys(engine.files)).toContain('data/characters/bunny/lines.json')
})

test('같은 이름의 로컬 폴더가 있으면 로컬 설치가 먼저', async ($, on) => {
  const local = Object.fromEntries(
    Object.entries(packFiles('bunny', { name: '내 토끼' })).map(([k, v]) => [k.replace('characters/bunny', 'bunny'), v]),
  )
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...local },
    http: onSite('bunny', packFiles('bunny', { name: '남의 토끼' })),
  })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install bunny')).text).toContain('내 토끼')
  expect(engine.fetched).toEqual([])
})

test("사이트에 없는 id → No pet called 'nope' on the dotchi site", async ($, on) => {
  const engine = fakeEngine(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'install nope')).text).toContain("No pet called 'nope' on the dotchi site")
  expect(Object.keys(engine.files).some(k => k.startsWith('data/'))).toBe(false)
})

test("오프라인 → Couldn't reach the dotchi site", async ($, on) => {
  fakeEngine(on, { http: { [`${SITE}/packs/bunny/dotchi.json`]: 'offline' } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install bunny')).text).toContain("Couldn't reach the dotchi site")
})

test('사이트가 깨진 팩을 주면 badPack 문구, 아무것도 남지 않음', async ($, on) => {
  const engine = fakeEngine(on, { http: onSite('bunny', packFiles('bunny', { art: '{"idle": 1}' })) })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install bunny')).text).toContain('art.json')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/characters/'))).toBe(false)
  expect(Object.keys(engine.files).some(k => k.startsWith('data/tmp/'))).toBe(false)
})

test('사이트의 펫이 내 펫과 똑같으면 -2를 만들지 않고 이미 있다고 알려 준다', async ($, on) => {
  const engine = fakeEngine(on, { http: onSite('squirrel', BUILTINS) })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install squirrel')).text).toBe('You already have 다람쥐 (squirrel). Switch with /dotchi squirrel')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/characters/'))).toBe(false)
  expect(Object.keys(engine.files).some(k => k.startsWith('data/tmp/'))).toBe(false)
})

test('이름(id)만 겹치는 다른 펫은 -2로 설치하고 왜 그런지 알려 준다', async ($, on) => {
  const engine = fakeEngine(on, { http: onSite('squirrel', packFiles('squirrel', { name: '남의 다람쥐' })) })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install squirrel')).text).toContain(
    "You already have a character called 'squirrel', so this one was installed as squirrel-2. Switch with /dotchi squirrel-2",
  )
  expect(Object.keys(engine.files)).toContain('data/characters/squirrel-2/art.json')
})

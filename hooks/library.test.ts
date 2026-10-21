import { expect, test } from 'claude-code/testing'

import { findPackRoot, uniqueId } from './packs'
import { parseDotchi } from './settings'
import { artJson, BUILTINS, dotchi, fakeEngine, HOME, packFiles, SESSION } from './test-kit'
import type { Files } from './test-kit'

/** 키 앞부분을 바꿔 다른 위치의 팩으로 */
const moved = (files: Files, from: string, to: string): Files =>
  Object.fromEntries(Object.entries(files).map(([k, v]) => [k.replace(from, to), v]))

const bunnyPack = (at: string) => moved(packFiles('bunny', { name: '토끼' }), 'characters/bunny', at)

test('findPackRoot: 맨 위 / 폴더 하나 / __MACOSX 섞임 / 둘 이상이면 null', () => {
  const f = (path: string) => ({ path, isDir: false })
  expect(findPackRoot([f('dotchi.json'), f('art.json')])).toBe('')
  expect(findPackRoot([f('bunny/dotchi.json'), f('bunny/art.json')])).toBe('bunny')
  expect(findPackRoot([f('__MACOSX/bunny/dotchi.json'), f('bunny/dotchi.json'), f('.DS_Store')])).toBe('bunny')
  expect(findPackRoot([f('a/dotchi.json'), f('b/dotchi.json')])).toBe(null)
  expect(findPackRoot([f('a/x.png')])).toBe(null)
})

test('uniqueId', () => {
  expect(uniqueId('bunny', new Set())).toBe('bunny')
  expect(uniqueId('squirrel', new Set(['squirrel', 'squirrel-2']))).toBe('squirrel-3')
})

test('parseDotchi install·export·remove 경로', () => {
  expect(parseDotchi('install ~/Downloads/a b.zip', HOME)).toEqual({ kind: 'install', path: `${HOME}/Downloads/a b.zip` })
  expect(parseDotchi('install "~/x y"', HOME)).toEqual({ kind: 'install', path: `${HOME}/x y` })
  expect(parseDotchi("install '/tmp/p'", HOME)).toEqual({ kind: 'install', path: '/tmp/p' })
  expect(parseDotchi('install', HOME)).toEqual({ kind: 'usage' })
  expect(parseDotchi('export bunny', HOME)).toEqual({ kind: 'export', target: 'bunny', withSource: false })
  expect(parseDotchi('export bunny --with-source', HOME)).toEqual({ kind: 'export', target: 'bunny', withSource: true })
  expect(parseDotchi('remove bunny', HOME)).toEqual({ kind: 'remove', target: 'bunny' })
  expect(parseDotchi('remove', HOME)).toEqual({ kind: 'usage' })
})

test('폴더 팩 설치 → 목록에 생기고 바꿀 수 있다', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunnyPack('ext/bunny') } })
  await $.session.start(SESSION)
  const result = await dotchi($, 'install /ext/bunny')
  expect(result.text).toContain('토끼(bunny)')
  expect(Object.keys(engine.files)).toContain('data/characters/bunny/art.json')
  expect((await dotchi($, 'list')).text).toContain('bunny (토끼)')
  expect((await dotchi($, 'bunny')).text).toContain('토끼')
})

test('겹치는 id는 번호를 붙여 설치하고 dotchi.json도 바꾼다', async ($, on) => {
  const pack = moved(packFiles('squirrel', { name: '남의 다람쥐' }), 'characters/squirrel', 'ext/sq')
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...pack } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install /ext/sq')).text).toContain('squirrel-2')
  expect(JSON.parse(engine.files['data/characters/squirrel-2/dotchi.json']!).id).toBe('squirrel-2')
})

test('설치 실패 시 아무것도 남기지 않는다', async ($, on) => {
  const broken = { ...bunnyPack('ext/bunny'), 'ext/bunny/art.json': '{"idle": 1}' }
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...broken } })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'install /ext/bunny')).text
  expect(text).toContain('art.json')
  expect(engine.runs.some(argv => argv[0] === 'cp')).toBe(false)
  expect(Object.keys(engine.files).some(k => k.startsWith('data/characters/'))).toBe(false)
})

test('없는 경로·팩이 아닌 폴더', async ($, on) => {
  fakeEngine(on, { files: { ...BUILTINS, 'ext/photos/a.png': 'x' } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install /nope')).text).toContain('/nope')
  expect((await dotchi($, 'install /ext/photos')).text).toContain('dotchi.json')
})

test('zip은 python3 zipfile로 풀고(폴더 하나 안, __MACOSX 섞임) tmp를 지운다', async ($, on) => {
  const inside = {
    ...moved(packFiles('bunny', { name: '토끼' }), 'characters/bunny', 'bunny'),
    '__MACOSX/bunny/._art.json': 'junk',
  }
  const engine = fakeEngine(on, { files: { ...BUILTINS, 'ext/bunny.zip': 'zip' }, zips: { '/ext/bunny.zip': inside } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install /ext/bunny.zip')).text).toContain('토끼(bunny)')
  expect(engine.runs.some(argv => argv.join(' ').startsWith('python3 -m zipfile -e /ext/bunny.zip'))).toBe(true)
  expect(Object.keys(engine.files).some(k => k.startsWith('data/tmp/'))).toBe(false)
  expect(Object.keys(engine.files)).toContain('data/characters/bunny/lines.json')
})

test('zip이 깨졌으면 Python 안내', async ($, on) => {
  fakeEngine(on, { files: { ...BUILTINS, 'ext/bad.zip': 'zip' } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install /ext/bad.zip')).text).toContain('Python 3')
})

test('export는 source를 기본으로 빼고 --with-source면 넣는다', async ($, on) => {
  const pack = { ...packFiles('bunny', { name: '토끼', origin: 'user' }), 'data/characters/bunny/source/1.png': 'img' }
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...pack } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'export bunny')).text).toContain('/work/bunny.dotchi.zip')
  expect(engine.zipsOut['/work/bunny.dotchi.zip']).toContain('bunny/dotchi.json')
  expect(engine.zipsOut['/work/bunny.dotchi.zip']).not.toContain('bunny/source/1.png')
  await dotchi($, 'export bunny --with-source')
  expect(engine.zipsOut['/work/bunny.dotchi.zip']).toContain('bunny/source/1.png')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/tmp/'))).toBe(false)
})

test('기본 팩도 내보낼 수 있다', async ($, on) => {
  const engine = fakeEngine(on)
  await $.session.start(SESSION)
  await dotchi($, 'export turtle')
  expect(engine.zipsOut['/work/turtle.dotchi.zip']).toContain('turtle/art.json')
})

test('기본 팩은 못 지우고, 지금 캐릭터를 지우면 다람쥐로', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...packFiles('bunny', { name: '토끼', origin: 'user', art: artJson() }) } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'remove turtle')).text).toContain('기본 캐릭터')
  await dotchi($, 'bunny')
  expect((await dotchi($, 'remove bunny')).text).toContain('bunny')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/characters/bunny'))).toBe(false)
  expect((engine.stored.settings as { character: string }).character).toBe('squirrel')
  expect((await dotchi($, 'remove bunny')).text).toContain("'bunny'")
})

test('드래그해서 넣은 경로(역슬래시로 공백 이스케이프)도 읽는다', () => {
  expect(parseDotchi('install /Users/me/My\\ Packs/x.zip', HOME)).toEqual({ kind: 'install', path: '/Users/me/My Packs/x.zip' })
  expect(parseDotchi('hatch ~/a\\ b\\(1\\).png', HOME)).toEqual({ kind: 'hatch', image: `${HOME}/a b(1).png` })
  expect(parseDotchi('install "/x/a\\ b"', HOME)).toEqual({ kind: 'install', path: '/x/a\\ b' })
})

test('설치·내보내기는 정해진 파일만 복사하고 링크는 건너뛴다', async ($, on) => {
  const pack = {
    ...moved(packFiles('bunny', { name: '토끼' }), 'characters/bunny', 'ext/bunny'),
    'ext/bunny/grid/1.txt': 'g',
    'ext/bunny/source/1.png': 'img',
    'ext/bunny/notes': 'secret',
    'ext/bunny/source/leak.png': 'link',
  }
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...pack }, links: ['ext/bunny/source/leak.png'] })
  await $.session.start(SESSION)
  await dotchi($, 'install /ext/bunny')
  const keys = Object.keys(engine.files).filter(k => k.startsWith('data/characters/bunny/'))
  expect(keys.sort()).toEqual(
    ['art.json', 'dotchi.json', 'grid/1.txt', 'lines.json', 'source/1.png'].map(f => `data/characters/bunny/${f}`),
  )
  await dotchi($, 'export bunny --with-source')
  expect(engine.zipsOut['/work/bunny.dotchi.zip']!.sort()).toEqual(
    ['bunny/art.json', 'bunny/dotchi.json', 'bunny/grid/1.txt', 'bunny/lines.json', 'bunny/source/1.png'],
  )
})

test('깨진 폴더가 남아 있으면 그 이름은 피하고, 안에 겹쳐 넣지 않는다', async ($, on) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...bunnyPack('ext/bunny'), 'data/characters/bunny/leftover.txt': 'x' },
  })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install /ext/bunny')).text).toContain('bunny-2')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/characters/bunny/bunny'))).toBe(false)
  expect(Object.keys(engine.files)).toContain('data/characters/bunny-2/dotchi.json')
})

test('uniqueId는 32자를 넘지 않는다', () => {
  const long = 'a'.repeat(32)
  const id = uniqueId(long, new Set([long]))
  expect(id.length <= 32).toBe(true)
  expect(id.endsWith('-2')).toBe(true)
})

test('복사한 뒤 실패하면 복사본을 지운다', async ($, on) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...bunnyPack('ext/bunny') },
    // cp는 성공했다고 하지만 아무것도 복사하지 않는다 → 설치본을 읽지 못함
    run: argv => ({ exitCode: argv[0] === 'cp' || argv[0] === 'mkdir' || argv[0] === 'rm' ? 0 : 1 }),
  })
  await $.session.start(SESSION)
  expect((await dotchi($, 'install /ext/bunny')).text).toContain('설치하지 못했어요')
  expect(engine.runs.some(argv => argv[0] === 'rm' && argv.at(-1)!.endsWith('/characters/bunny'))).toBe(true)
})

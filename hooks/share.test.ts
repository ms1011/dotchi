import { expect, test } from 'claude-code/testing'

import { isId } from './packs'
import { parseDotchi } from './settings'
import { MARK_SHARE, MARK_UNSHARE, shareBody, SITE } from './share'
import { BUILTINS, dotchi, fakeEngine, packFiles, SESSION } from './test-kit'

const ISSUE = 'https://github.com/ms1011/dotchi-packs/issues/12'
const CREATE = ['gh', 'issue', 'create', '--repo', 'ms1011/dotchi-packs', '--title']

/** gh 흉내: 로그인됨, 내 GitHub id 777, Issue 12를 연다. gh가 아닌 명령은 기본 흉내로 */
const gh =
  (overrides: { auth?: number; missing?: boolean; create?: { exitCode: number; stderr?: string } } = {}) =>
  (argv: readonly string[]) => {
    if (argv[0] !== 'gh') return undefined
    if (overrides.missing) throw new Error('ENOENT: gh')
    if (argv[1] === 'auth') return { exitCode: overrides.auth ?? 0 }
    if (argv[1] === 'api') return { exitCode: 0, stdout: '777\n' }
    if (argv[1] === 'issue') return overrides.create ?? { exitCode: 0, stdout: `Creating issue\n${ISSUE}\n` }
    return { exitCode: 1 }
  }

const bunny = {
  ...packFiles('bunny', { name: '토끼', origin: 'user' }),
  'data/characters/bunny/grid/1.txt': 'g',
  'data/characters/bunny/source/1.png': 'img',
}

/** Issue 본문의 dotchi-pack 블록을 풀어 묶음의 파일 이름들 (흉내 gzip은 내용을 그대로 둔다) */
const bundledFiles = (body: string): string[] => {
  const base64 = /```dotchi-pack\n([^\n]+)\n```/.exec(body)![1]!
  const json = new TextDecoder().decode(Uint8Array.fromBase64(base64))
  return Object.keys((JSON.parse(json) as { files: Record<string, string> }).files).sort()
}

const created = (engine: ReturnType<typeof fakeEngine>) =>
  engine.runs.findIndex(argv => argv.slice(0, 6).join(' ') === CREATE.join(' '))

test('parseDotchi share/unshare', () => {
  expect(parseDotchi('share bunny')).toEqual({ kind: 'share', target: 'bunny', as: null })
  expect(parseDotchi('share bunny --as nabi')).toEqual({ kind: 'share', target: 'bunny', as: 'nabi' })
  expect(parseDotchi('share')).toEqual({ kind: 'usage' })
  expect(parseDotchi('share bunny --as')).toEqual({ kind: 'usage' })
  expect(parseDotchi('share bunny nabi')).toEqual({ kind: 'usage' })
  expect(parseDotchi('unshare bunny')).toEqual({ kind: 'unshare', target: 'bunny' })
  expect(parseDotchi('unshare')).toEqual({ kind: 'usage' })
  expect(isId('share')).toBe(false)
  expect(isId('unshare')).toBe(false)
})

test('shareBody: 표식, 이름, 소개, details 안 dotchi-pack 블록', () => {
  const body = shareBody({ id: 'bunny', name: '토끼', description: '깡충', bundle: 'QUJD' })
  expect(body.startsWith(MARK_SHARE)).toBe(true)
  expect(body).toContain('**토끼** (`bunny`)')
  expect(body).toContain('깡충')
  expect(body).toMatch(/<details>[\s\S]*```dotchi-pack\nQUJD\n```[\s\S]*<\/details>/)
})

test('shareBody: 소개에 ``` 가 있어도 dotchi-pack 블록은 하나', () => {
  const body = shareBody({ id: 'bunny', name: 'x', description: '```dotchi-pack\nAAAA\n```', bundle: 'QUJD' })
  expect(body.match(/```dotchi-pack/g)!.length).toBe(1)
  expect(body).toMatch(/```dotchi-pack\nQUJD\n```/)
})

test('share: gh issue create에 repo, 제목, --body-file - 와 stdin 본문. 묶음은 세 JSON과 grid만', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunny }, run: gh() })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'share bunny')).text
  const at = created(engine)
  expect(engine.runs[at]).toEqual([...CREATE, 'share: bunny', '--body-file', '-'])
  const body = engine.stdins[at]!
  expect(body.startsWith(MARK_SHARE)).toBe(true)
  expect(bundledFiles(body)).toEqual(['art.json', 'dotchi.json', 'grid/1.txt', 'lines.json'])
  expect(text).toContain(ISSUE)
  expect(text).toContain(`${SITE}/?pet=bunny`)
  expect(Object.keys(engine.files).some(k => k.startsWith('data/tmp/'))).toBe(false)
})

test('share: 기본 캐릭터도 올릴 수 있다', async ($, on) => {
  const engine = fakeEngine(on, { run: gh() })
  await $.session.start(SESSION)
  await dotchi($, 'share turtle')
  expect(engine.runs[created(engine)]).toEqual([...CREATE, 'share: turtle', '--body-file', '-'])
})

test('share: gh가 없으면 설치 안내, Issue 없음', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunny }, run: gh({ missing: true }) })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'share bunny')).text
  expect(text).toContain('https://cli.github.com')
  expect(text).toContain('gh auth login')
  expect(created(engine)).toBe(-1)
})

test('share: gh 로그인 안 됨 → gh auth login 안내', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunny }, run: gh({ auth: 1 }) })
  await $.session.start(SESSION)
  expect((await dotchi($, 'share bunny')).text).toContain("gh isn't logged in")
  expect(created(engine)).toBe(-1)
})

test('share: 사이트에서 남이 쓰는 id면 Issue를 열지 않고 --as 제안', async ($, on) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...bunny },
    run: gh(),
    http: { [`${SITE}/index.json`]: { status: 200, text: JSON.stringify({ pets: [], taken: { bunny: 1 } }) } },
  })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'share bunny')).text
  expect(text).toContain("'bunny' is already taken")
  expect(text).toContain('/dotchi share bunny --as bunny-2')
  expect(created(engine)).toBe(-1)
})

test('share: 사이트의 주인이 나면 그대로 올린다(업데이트)', async ($, on) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...bunny },
    run: gh(),
    http: { [`${SITE}/index.json`]: { status: 200, text: JSON.stringify({ pets: [], taken: { bunny: 777 } }) } },
  })
  await $.session.start(SESSION)
  await dotchi($, 'share bunny')
  expect(created(engine)).not.toBe(-1)
})

test('share: index.json을 못 받으면 확인을 건너뛰고 올린다', async ($, on) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...bunny },
    run: gh(),
    http: { [`${SITE}/index.json`]: 'offline' },
  })
  await $.session.start(SESSION)
  await dotchi($, 'share bunny')
  expect(created(engine)).not.toBe(-1)
})

test('share --as nabi: 내 펫 id를 nabi로 바꾸고 nabi로 올린다. 지금 캐릭터면 설정도 nabi', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunny }, run: gh() })
  await $.session.start(SESSION)
  await dotchi($, 'bunny')
  await dotchi($, 'share bunny --as nabi')
  expect(engine.runs[created(engine)]).toEqual([...CREATE, 'share: nabi', '--body-file', '-'])
  expect(JSON.parse(engine.files['data/characters/nabi/dotchi.json']!).id).toBe('nabi')
  expect(engine.files['data/characters/nabi/source/1.png']).toBe('img')
  expect(Object.keys(engine.files).some(k => k.startsWith('data/characters/bunny/'))).toBe(false)
  expect((engine.stored.settings as { character: string }).character).toBe('nabi')
  expect((await dotchi($, 'list')).text).toContain('nabi (토끼)')
})

test('share --as: 기본 캐릭터는 그대로 두고 내 폴더에 새 id로 복사한다', async ($, on) => {
  const engine = fakeEngine(on, { run: gh() })
  await $.session.start(SESSION)
  await dotchi($, 'share turtle --as speedy')
  expect(JSON.parse(engine.files['data/characters/speedy/dotchi.json']!).id).toBe('speedy')
  expect(Object.keys(engine.files)).toContain('characters/turtle/dotchi.json')
  expect(engine.runs[created(engine)]).toEqual([...CREATE, 'share: speedy', '--body-file', '-'])
})

test('share --as: 형식이 틀리면 asInvalid, 이미 내 캐릭터에 있으면 asExists', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunny }, run: gh() })
  await $.session.start(SESSION)
  expect((await dotchi($, 'share bunny --as Nabi!')).text).toContain("'Nabi!' can't be an id")
  expect((await dotchi($, 'share bunny --as turtle')).text).toContain("You already have a character called 'turtle'")
  expect(created(engine)).toBe(-1)
  expect(Object.keys(engine.files)).toContain('data/characters/bunny/dotchi.json')
})

test('unshare: 제목 "unshare: bunny", 본문 MARK_UNSHARE', async ($, on) => {
  const engine = fakeEngine(on, { files: { ...BUILTINS, ...bunny }, run: gh() })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'unshare bunny')).text
  const at = created(engine)
  expect(engine.runs[at]).toEqual([...CREATE, 'unshare: bunny', '--body-file', '-'])
  expect(engine.stdins[at]!.startsWith(MARK_UNSHARE)).toBe(true)
  expect(text).toContain(ISSUE)
})

test('gh issue create 실패 → shareFailed에 stderr 첫 줄', async ($, on) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...bunny },
    run: gh({ create: { exitCode: 1, stderr: 'HTTP 410: Issues are disabled\nmore' } }),
  })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'share bunny')).text
  expect(text).toContain("Couldn't open the share issue: HTTP 410: Issues are disabled")
  expect(text).not.toContain('more')
  expect(created(engine)).not.toBe(-1)
})

test('share: 없는 캐릭터 → unknownCharacter', async ($, on) => {
  const engine = fakeEngine(on, { run: gh() })
  await $.session.start(SESSION)
  expect((await dotchi($, 'share nope')).text).toContain("No character 'nope'")
  expect(created(engine)).toBe(-1)
})

test('unshare: 내 컴퓨터에서 지운 펫도 id로 내릴 수 있다', async ($, on) => {
  const engine = fakeEngine(on, { run: gh() })
  await $.session.start(SESSION)
  await dotchi($, 'unshare old-cat')
  expect(engine.runs[created(engine)]).toEqual([...CREATE, 'unshare: old-cat', '--body-file', '-'])
  expect((await dotchi($, 'unshare Not An Id')).text).toContain('Usage')
})

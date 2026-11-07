import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionMeasureInput } from 'claude-code'

import { MARK_THEME_SHARE, SITE } from './share'
import { BUILTINS, DATA, dotchi, fakeEngine, runCommand, SESSION } from './test-kit'

const ISSUE = 'https://github.com/ms1011/dotchi-packs/issues/30'

const themeJson = (id: string, over: Record<string, unknown> = {}) =>
  JSON.stringify({ format: 1, id, name: { ko: { pastel: '파스텔', candy: '사탕' }[id] ?? id, en: id }, ...over })

/** 기본 테마 둘: 파스텔(기본 모양)과 사탕 */
const THEMES = {
  'themes/pastel/theme.json': themeJson('pastel'),
  'themes/candy/theme.json': themeJson('candy', {
    colors: { ok: '#111111', warn: '#222222', danger: '#333333', dim: '#444444', accent: '#555555' },
    faces: { ok: 'O', warn: 'W', danger: 'D' },
    hearts: ['💗', '🤍'],
    symbols: { week: '🍭' },
  }),
  'tools/theme-prompt.md': 'THEME task={task} data={data} taken={taken} talk={langName}',
}

const pane = {
  plugin: 'dotchi',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'dotchi',
  props: { title: 'dotchi', isFocused: false, bodyColumns: 47, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const setup = (
  on: On,
  options: { files?: Record<string, string>; http?: Record<string, { status: number; text: string }>; show?: string } = {},
) => {
  const engine = fakeEngine(on, {
    files: { ...BUILTINS, ...THEMES, ...options.files },
    http: options.http,
    store: { settings: { character: 'squirrel', show: options.show ?? 'working', voice: false, lang: 'ko' } },
    run: argv => {
      if (argv[0] === 'git') return { exitCode: 128 }
      if (argv[0] !== 'gh') return undefined
      if (argv[1] === 'auth') return { exitCode: 0 }
      if (argv[1] === 'api') return { exitCode: 0, stdout: '777\n' }
      if (argv[1] === 'issue') return { exitCode: 0, stdout: `${ISSUE}\n` }
      return { exitCode: 1 }
    },
  })
  const submitted: string[] = []
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.measure', (_, e) => ({ changed: e.changed }))
  return { ...engine, submitted }
}

const measure = (context: number): SessionMeasureInput => ({
  context: { window: 200000, percent: context, tokens: context * 2000 },
  rateLimits: [{ kind: 'seven_day', percentUsed: 41 }],
  changed: ['context', 'rateLimits'],
})

const paneTexts = async ($: Engine) => {
  const ui = await $.ui.mount(pane)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => ({ text: t.text, color: t.props.color as string | undefined }))
  await ui.unmount()
  return texts
}

test('theme list: 기본 테마와 지금 테마 표시', async ($, on) => {
  setup(on)
  await $.session.start(SESSION)
  const { text } = await dotchi($, 'theme list')
  expect(text).toContain('▶ pastel (파스텔) · built-in')
  expect(text).toContain('  candy (사탕) · built-in')
  expect(text).toContain('/dotchi theme new')
})

test('테마를 바꾸면 상태 줄의 하트·기호와 패널 색이 그 테마로, 다음 세션에도', async ($, on) => {
  const { statuses, stored, clock } = setup(on, { show: 'side' })
  await $.session.start(SESSION)
  await runCommand($, 'dotchi', 'show working', 237)
  expect((await dotchi($, 'theme 사탕')).text).toBe('Theme: 사탕 (candy)')
  expect((stored.settings as { theme: string }).theme).toBe('candy')
  await $.session.measure(measure(62))
  await clock.settle()
  expect(statuses.at(-1)).toBe('🐾 💗💗💗🤍🤍 62% · 🍭 41%')

  await runCommand($, 'dotchi', 'show side', 237)
  const texts = await paneTexts($)
  expect(texts.find(t => t.text === 'O')?.color).toBe('#555555')
  expect(texts.find(t => t.text.includes('62%'))?.color).toBe('#111111')
  expect(texts.find(t => t.text === '배부름')?.color).toBe('#444444')
})

test('없는 테마는 알려 주고 그대로', async ($, on) => {
  const { stored } = setup(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme nope')).text).toContain("No theme 'nope'")
  expect((stored.settings as { theme?: string }).theme ?? 'pastel').toBe('pastel')
})

test('theme set: 기본 테마는 내 폴더에 같은 id로 복사해서 한 칸만 바꾼다', async ($, on) => {
  const { files, statuses } = setup(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme set hearts 🍬 ·')).text).toBe('Set hearts in pastel')
  const saved = JSON.parse(files['data/themes/pastel/theme.json']!) as Record<string, unknown>
  expect(saved.hearts).toEqual(['🍬', '·'])
  expect(saved.colors).toBe(undefined)
  expect(files['themes/pastel/theme.json']).toBe(THEMES['themes/pastel/theme.json'])
  await $.session.measure(measure(62))
  expect(statuses.at(-1)).toBe('🐾 🍬🍬🍬·· 62% · ⚡ 41%')
  expect((await dotchi($, 'theme list')).text).toContain('▶ pastel (파스텔) · mine')
})

test('theme set: 모르는 칸, 맞지 않는 값은 이유와 함께 거절', async ($, on) => {
  const { files } = setup(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme set colour.ok #000000')).text).toContain("No key 'colour.ok'. Keys: color.ok")
  expect((await dotchi($, 'theme set color.ok pink')).text).toContain("'pink' doesn't fit color.ok")
  expect(files['data/themes/pastel/theme.json']).toBe(undefined)
})

test('theme install: 사이트 id로 받아 설치, 같은 것은 이미 있다고, id만 겹치면 번호', async ($, on) => {
  const ocean = themeJson('ocean', { colors: { ok: '#00aaff' } })
  const { files } = setup(on, {
    http: {
      [`${SITE}/themes/ocean/theme.json`]: { status: 200, text: ocean },
      [`${SITE}/themes/candy/theme.json`]: { status: 200, text: themeJson('candy', { faces: { ok: 'X' } }) },
    },
  })
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme install ocean')).text).toBe('Installed theme ocean (ocean). Switch with /dotchi theme ocean')
  expect(JSON.parse(files['data/themes/ocean/theme.json']!).colors).toEqual({ ok: '#00aaff' })
  expect((await dotchi($, `theme install ${SITE}/?theme=ocean`)).text).toContain('You already have theme ocean (ocean)')
  expect((await dotchi($, 'theme install candy')).text).toContain("so this one was installed as candy-2")
  expect(JSON.parse(files['data/themes/candy-2/theme.json']!).id).toBe('candy-2')
  expect((await dotchi($, 'theme install nope')).text).toBe("No theme called 'nope' on the dotchi site")
})

test('theme install: 내 컴퓨터의 theme.json 파일', async ($, on) => {
  const { files } = setup(on, { files: { 'Downloads/forest.theme.json': themeJson('forest') } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme install /home/test/Downloads/forest.theme.json')).text).toContain('Installed theme')
  expect(files['data/themes/forest/theme.json']).toBeDefined()
  expect((await dotchi($, 'theme install /home/test/Downloads/none.theme.json')).text).toContain("Couldn't install")
})

test('theme share: theme-share Issue에 표식과 theme.json(base64)', async ($, on) => {
  const engine = setup(on, { http: { [`${SITE}/index.json`]: { status: 200, text: '{"pets":[],"taken":{},"takenThemes":{}}' } } })
  await $.session.start(SESSION)
  const { text } = await dotchi($, 'theme share candy')
  expect(text).toContain('Sent theme 사탕 (candy)')
  expect(text).toContain(`${SITE}/?theme=candy`)
  const at = engine.runs.findIndex(argv => argv[1] === 'issue')
  expect(engine.runs[at]).toEqual(['gh', 'issue', 'create', '--repo', 'ms1011/dotchi-packs', '--title', 'theme-share: candy', '--body-file', '-'])
  const body = engine.stdins[at]!
  expect(body.startsWith(MARK_THEME_SHARE)).toBe(true)
  const base64 = /```dotchi-theme\n([^\n]+)\n```/.exec(body)![1]!
  const json = JSON.parse(new TextDecoder().decode(Uint8Array.fromBase64(base64))) as { id: string; faces: unknown }
  expect(json.id).toBe('candy')
  expect(json.faces).toEqual({ ok: 'O', warn: 'W', danger: 'D' })
})

test('theme share: 남이 쓰는 테마 id면 --as를 권한다', async ($, on) => {
  const engine = setup(on, { http: { [`${SITE}/index.json`]: { status: 200, text: '{"pets":[],"taken":{},"takenThemes":{"candy":5}}' } } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme share candy')).text).toContain('/dotchi theme share candy --as candy-2')
  expect(engine.runs.some(argv => argv[1] === 'issue')).toBe(false)
})

test('theme share --as: 새 id로 내 테마를 만들고 지금 테마면 따라간다', async ($, on) => {
  const { files, stored } = setup(on, { files: { 'data/themes/mine/theme.json': themeJson('mine') } })
  await $.session.start(SESSION)
  await dotchi($, 'theme mine')
  expect((await dotchi($, 'theme share mine --as mine-2')).text).toContain('(mine-2)')
  expect(files['data/themes/mine/theme.json']).toBe(undefined)
  expect(JSON.parse(files['data/themes/mine-2/theme.json']!).id).toBe('mine-2')
  expect((stored.settings as { theme: string }).theme).toBe('mine-2')
})

test('theme unshare는 theme-unshare Issue', async ($, on) => {
  const engine = setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'theme unshare candy')
  expect(engine.runs.find(argv => argv[1] === 'issue')).toContain('theme-unshare: candy')
})

test('theme remove: 기본 테마는 못 지우고, 지금 쓰던 내 테마를 지우면 파스텔로', async ($, on) => {
  const { files, stored } = setup(on, { files: { 'data/themes/mine/theme.json': themeJson('mine') } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme remove candy')).text).toContain("candy is built in and can't be removed")
  await dotchi($, 'theme mine')
  expect((await dotchi($, 'theme remove mine')).text).toBe('Removed mine')
  expect(files['data/themes/mine/theme.json']).toBe(undefined)
  expect((stored.settings as { theme: string }).theme).toBe('pastel')
})

test('theme export: 작업 폴더에 <id>.theme.json', async ($, on) => {
  const { writes } = setup(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme export candy')).text).toBe('Pack created: /work/candy.theme.json')
  expect(JSON.parse(writes.find(w => w.path === '/work/candy.theme.json')!.text).id).toBe('candy')
})

test('theme new·edit: 지시로 Claude 턴을 시작한다. 기본 테마를 고치면 내 폴더로 복사', async ($, on) => {
  const { submitted, files, clock } = setup(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'theme new 바다 느낌')).text).toContain('Starting a new theme')
  await clock.settle()
  expect(submitted.at(-1)).toBe(`THEME task=make a new status-line theme. My idea: "바다 느낌" data=${DATA} taken=pastel, candy talk=Korean`)
  await dotchi($, 'theme edit candy')
  await clock.settle()
  expect(submitted.at(-1)).toContain(`change my status-line theme \`candy\` (its file is ${DATA}/themes/candy/theme.json)`)
  expect(files['data/themes/candy/theme.json']).toBeDefined()
})

test('theme remove: 고친 기본 테마를 지우면 기본 테마로 돌아가고 설정은 그대로', async ($, on) => {
  const { files, stored } = setup(on)
  await $.session.start(SESSION)
  await dotchi($, 'theme candy')
  await dotchi($, 'theme set face.ok Q')
  expect((await dotchi($, 'theme remove candy')).text).toBe('Removed candy')
  expect(files['data/themes/candy/theme.json']).toBe(undefined)
  expect((stored.settings as { theme: string }).theme).toBe('candy')
  expect((await dotchi($, 'theme list')).text).toContain('▶ candy (사탕) · built-in')
})

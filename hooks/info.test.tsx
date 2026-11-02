import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BUILTINS, dotchi, fakeEngine, runCommand, SESSION } from './test-kit'

const STATUS = ['# branch.oid abc', '# branch.head main', '# branch.upstream origin/main', '# branch.ab +2 -0'].join('\n')
const DIRTY = [STATUS, '1 .M N... 100644 100644 100644 a b hooks/a.ts', '? notes.md', '1 .M N... 100644 100644 100644 a b z.ts'].join('\n')

const pane = {
  plugin: 'dotchi',
  surface: 'terminal',
  component: 'Pane',
  requestId: 'dotchi',
  props: { title: 'dotchi', isFocused: false, bodyColumns: 47, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

/** git 흉내: status는 out, rev-parse는 저장소 뿌리. repo가 false면 저장소가 아니다 */
const setup = (on: On, options: { out?: string; repo?: boolean; show?: string } = {}) => {
  const git = { out: options.out ?? STATUS, calls: 0, argv: [] as string[] }
  const engine = fakeEngine(on, {
    files: BUILTINS,
    store: { settings: { character: 'squirrel', show: options.show ?? 'side', voice: false, lang: 'ko' } },
    run: argv => {
      if (argv[0] !== 'git') return undefined
      if (options.repo === false) return { exitCode: 128, stderr: 'fatal: not a git repository' }
      if (argv.includes('rev-parse')) return { exitCode: 0, stdout: '/work\n' }
      git.calls++
      git.argv = [...argv]
      return { exitCode: 0, stdout: git.out }
    },
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', (_, e) => {
    if (e.tool === 'Artifact') {
      const action = (e as { action?: string }).action
      if (action === 'list') return { result: { artifacts: [] } as never }
      if ((e as { mock?: string }).mock === 'text') {
        return { result: 'Published: https://claude.ai/code/artifact/from-text (private)' as never }
      }
      return { result: { url: 'https://claude.ai/code/artifact/abc', path: 'page.html', title: '조사 보고서' } as never }
    }
    return { result: {} as never }
  })
  return { ...engine, git }
}

const texts = async ($: Engine) => {
  const ui = await $.ui.mount(pane)
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const links = (await ui.findAll({ type: 'Link' })).map(l => ({ href: l.props.href, label: l.props.label }))
  await ui.unmount()
  return { all, links }
}

test('저장소가 아니면 git 영역도 상태 줄도 없다', async ($, on) => {
  const { statuses, clock } = setup(on, { repo: false, show: 'working' })
  await $.session.start(SESSION)
  await clock.settle()
  const { all } = await texts($)
  expect(all.some(t => /⎇/.test(t))).toBe(false)
  expect(statuses.filter(s => s !== undefined)).toEqual([])
})

test('깨끗하면 브랜치와 깨끗해요', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start(SESSION)
  await clock.settle()
  const { all } = await texts($)
  expect(all).toContain('⎇ main ↑2')
  expect(all).toContain('깨끗해요')
})

test('바뀐 파일 목록, Claude가 고친 파일이 먼저', async ($, on) => {
  const { clock } = setup(on, { out: DIRTY })
  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Edit', file_path: '/work/z.ts', old_string: 'a', new_string: 'b' } as never)
  await clock.settle()
  const { all } = await texts($)
  const lines = all.filter(t => /^[MAD?R] /.test(t))
  expect(lines).toEqual(['M ✎ z.ts', 'M hooks/a.ts', '? notes.md'])
})

test('아티팩트를 올리면 제목 링크로 보인다. list 같은 호출은 아니다', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Artifact', action: 'list' } as never)
  expect((await texts($)).links).toEqual([])
  await $.tool.call({ tool: 'Artifact', file_path: '/work/page.html' } as never)
  await $.tool.call({ tool: 'Artifact', file_path: '/work/page.html' } as never)
  expect((await texts($)).links).toEqual([{ href: 'https://claude.ai/code/artifact/abc', label: '조사 보고서' }])
})

test('아티팩트 목록은 저장되어 다시 연 세션에서도 보인다', async ($, on) => {
  const { stored, clock } = setup(on)
  stored['artifacts:test-session'] = [{ url: 'https://claude.ai/code/artifact/old', title: '예전 것' }]
  await $.session.start(SESSION)
  await clock.settle()
  expect((await texts($)).links).toEqual([{ href: 'https://claude.ai/code/artifact/old', label: '예전 것' }])
})

test('패널이 없을 때는 상태 줄에 요약, 패널을 열면 지운다', async ($, on) => {
  const { statuses, clock } = setup(on, { out: DIRTY, show: 'working' })
  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Artifact', file_path: '/work/page.html' } as never)
  expect(statuses.at(-1)).toBe('⎇ main ↑2 · 파일 3개 · 🔗 조사 보고서')
  await runCommand($, 'dotchi', 'show side', 237)
  expect(statuses.at(-1)).toBe(undefined)
  await dotchi($, 'show working')
  expect(statuses.at(-1)).toBe('⎇ main ↑2 · 파일 3개 · 🔗 조사 보고서')
})

test('30초마다 git을 다시 읽는다', async ($, on) => {
  const { clock, git } = setup(on)
  await $.session.start(SESSION)
  await clock.settle()
  const before = git.calls
  git.out = DIRTY
  await clock.advance(30000)
  expect(git.calls).toBeGreaterThan(before)
  expect((await texts($)).all).toContain('M hooks/a.ts')
})

test('git은 index.lock을 잡지 않게 --no-optional-locks로 읽는다', async ($, on) => {
  const { clock, git } = setup(on)
  await $.session.start(SESSION)
  await clock.settle()
  expect(git.argv).toContain('--no-optional-locks')
})

test('읽는 중에 파일이 바뀌면 끝난 뒤 한 번 더 읽는다', async ($, on) => {
  const { clock, git } = setup(on)
  await $.session.start(SESSION)
  await clock.settle()
  const before = git.calls
  await Promise.all([
    $.tool.call({ tool: 'Edit', file_path: '/work/a.ts', old_string: 'a', new_string: 'b' } as never),
    $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' } as never),
  ])
  await clock.settle()
  expect(git.calls).toBeGreaterThanOrEqual(before + 2)
})

test('서브에이전트가 고친 파일에도 표시가 붙고 아티팩트도 담긴다', async ($, on) => {
  const { clock } = setup(on, { out: DIRTY })
  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Edit', file_path: '/work/z.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Artifact', file_path: '/work/page.html', agentId: 'a1' } as never)
  await clock.settle()
  const { all, links } = await texts($)
  expect(all).toContain('M ✎ z.ts')
  expect(links.length).toBe(1)
})

test('결과가 글로만 와도 아티팩트 주소를 찾아 담는다', async ($, on) => {
  const { clock } = setup(on)
  await $.session.start(SESSION)
  await clock.settle()
  await $.tool.call({ tool: 'Artifact', file_path: '/work/보고서.html', mock: 'text' } as never)
  const { links } = await texts($)
  expect(links).toEqual([{ href: 'https://claude.ai/code/artifact/from-text', label: '보고서.html' }])
})

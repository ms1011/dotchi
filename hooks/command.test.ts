import { expect, test } from 'claude-code/testing'

import { artJson, BUILTINS, dotchi, fakeEngine, lineSet, packFiles, SESSION } from './test-kit'

test('처음에는 다람쥐, 일할 때만, 한마디 꺼짐', async ($, on) => {
  fakeEngine(on)
  await $.session.start(SESSION)
  expect((await dotchi($, '')).text).toBe('지금: 다람쥐 · 보이는 때: 일할 때만 · 답변 끝 한마디: 꺼짐')
})

test('/dotchi <id 또는 이름>으로 바꾸고 다음 세션에도 유지', async ($, on) => {
  const { stored } = fakeEngine(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'turtle')).text).toContain('거북이')
  expect((stored.settings as { character: string }).character).toBe('turtle')
  await dotchi($, 'Squirrel')
  expect((stored.settings as { character: string }).character).toBe('squirrel')
  await dotchi($, '거북이')
  expect((stored.settings as { character: string }).character).toBe('turtle')
})

test('없는 캐릭터는 알려 주고 그대로', async ($, on) => {
  const { stored } = fakeEngine(on)
  await $.session.start(SESSION)
  expect((await dotchi($, 'bunny')).text).toContain("'bunny' 캐릭터가 없어요")
  expect(stored.settings).toBe(undefined)
})

test('list는 기본과 내 캐릭터를 구분하고 지금 캐릭터를 표시', async ($, on) => {
  fakeEngine(on, { files: { ...BUILTINS, ...packFiles('bunny', { name: '토끼', origin: 'user' }) } })
  await $.session.start(SESSION)
  const text = (await dotchi($, 'list')).text
  expect(text).toContain('▶ squirrel (다람쥐) · 기본')
  expect(text).toContain('turtle (거북이) · 기본')
  expect(text).toContain('bunny (토끼) · 내 캐릭터')
})

test('사용자 팩이 같은 id의 기본 팩을 이긴다', async ($, on) => {
  fakeEngine(on, { files: { ...BUILTINS, ...packFiles('squirrel', { name: '내 다람쥐', origin: 'user' }) } })
  await $.session.start(SESSION)
  expect((await dotchi($, '')).text).toContain('지금: 내 다람쥐')
})

test('깨진 팩은 건너뛴다', async ($, on) => {
  fakeEngine(on, { files: { ...BUILTINS, ...packFiles('broken', { art: '{"idle": 1}', origin: 'user' }) } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'list')).text).not.toContain('broken')
  expect((await dotchi($, 'broken')).text).toContain("'broken' 캐릭터가 없어요")
})

test('저장된 캐릭터가 없으면 다람쥐', async ($, on) => {
  fakeEngine(on, { store: { settings: { character: 'bunny', show: 'always', voice: true, lang: null } } })
  await $.session.start(SESSION)
  expect((await dotchi($, '')).text).toBe('지금: 다람쥐 · 보이는 때: 항상 · 답변 끝 한마디: 켜짐')
})

test('사용자 팩 폴더가 없어도 기본 팩으로 동작', async ($, on) => {
  fakeEngine(on, { files: { ...packFiles('squirrel', { name: '다람쥐', lines: { ko: lineSet('다') }, art: artJson() }) } })
  await $.session.start(SESSION)
  expect((await dotchi($, 'list')).text).toContain('squirrel')
})

test('/clear 뒤에도 저장된 설정을 다시 읽는다 (Claude Code가 세션 상태를 지움)', async ($, on) => {
  const engine = fakeEngine(on)
  on('classic.SessionStart', () => ({}))
  await $.session.start(SESSION)
  engine.stored.settings = { character: 'turtle', show: 'always', voice: true, lang: null }
  await $.classic.SessionStart({ source: 'clear' })
  expect((await dotchi($, '')).text).toBe('지금: 거북이 · 보이는 때: 항상 · 답변 끝 한마디: 켜짐')
})

test('/clear 뒤 옆 패널 모드면 패널을 다시 연다', async ($, on) => {
  const engine = fakeEngine(on, { store: { settings: { character: 'turtle', show: 'side', voice: false, lang: null } } })
  on('classic.SessionStart', () => ({}))
  await $.session.start(SESSION)
  await $.classic.SessionStart({ source: 'clear' })
  expect(engine.opened.length).toBe(2)
})

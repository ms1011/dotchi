import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Art, Character, Lang, LineSet, Settings } from '../types'
import { cropColumns, encodeFrame, halve, usedColumns } from './dots'
import { detectLang, LANG_NAMES, t } from './i18n'
import type { BandLayout } from './layout'
import { bandLayout, paneLayout } from './layout'
import { copyToUser, dataDir, exportPack, installPack, loadCharacters, removePack, resolveCharacter } from './library'
import { endingLine, idleLine, spinnerLine } from './lines'
import { frameMsOf, nameOf, pickLines, ticksPerLine } from './packs'
import { DEFAULT_SETTINGS, normalizeSettings, parseDotchi } from './settings'

const settingsAtom = atom({ plugin: 'dotchi', key: 'settings' } as const, DEFAULT_SETTINGS)
const tickAtom = atom({ plugin: 'dotchi', key: 'tick' } as const, 0)
const workingAtom = atom({ plugin: 'dotchi', key: 'working' } as const, false)
const paneAtom = atom({ plugin: 'dotchi', key: 'paneShown' } as const, false)

/** 옆 패널의 id와, 너비를 모를 때 쓰는 칸 수 */
const PANE = 'dotchi'
const PANE_COLUMNS = 48
const NO_LINES: LineSet = { spinner: [], idle: [], ending: [] }


/** 설정을 바꾸고 저장한다: 다음 세션에도 유지 */
async function saveSettings($: EngineInterface, settings: Settings): Promise<void> {
  await update($, settingsAtom, () => settings)
  await $.store.set('settings', settings)
}

/** 저장된 설정을 읽어 세션 상태에 넣는다 */
async function loadSettings($: EngineInterface): Promise<Settings> {
  const saved = normalizeSettings(await $.store.get('settings'))
  await update($, settingsAtom, () => saved)
  return saved
}

/** 옆 패널을 연다. 좁은 화면이라 자리를 못 잡으면 false (그때는 입력창 위 띠에 그린다) */
async function openPane($: EngineInterface, columns: number): Promise<boolean> {
  const result = await $.ui.open({ id: PANE, title: 'dotchi', columns })
  await update($, paneAtom, () => result.isPlaced)
  return result.isPlaced
}

/**
 * 남이 만든 팩의 이름이 Claude에게 넘기는 지시에 들어간다: 지시를 끼워 넣지 못하게
 * 따옴표·백틱·줄바꿈·괄호 같은 글자를 빼고 40자로 자른다
 */
const safeName = (name: string, fallback: string) =>
  name.replace(/[`"'\\{}<>$\n\r\t]/g, '').trim().slice(0, 40).trim() || fallback

/** 지시문의 {이름} 자리를 채운다 */
const fill = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole)

/**
 * Claude에게 작업을 넘긴다. command.run 안에서는 기다릴 수 없어서(이 명령이 끝나길 기다리게 됨)
 * 명령이 끝난 직후에 넘긴다. 넘기지 못하면 알린다
 */
async function handToClaude($: EngineInterface, text: string, failure: string): Promise<void> {
  $.clock.after(0, () => void $.prompt.submit({ text, asUser: true }).catch(() => $.ui.toast(failure)))
}

/** 플러그인에 든 지시문 파일 읽기 */
async function readPrompt($: EngineInterface, file: string): Promise<string | null> {
  return $.fs
    .read(`${$.plugin.root}/${file}`)
    .then(String)
    .catch(() => null)
}

/** 그림 한 컷을 Raster 칸으로: 양옆 빈칸은 잘라 말풍선을 머리에 붙인다 */
const dotsFor = (art: Art, isWorking: boolean, tick: number, layout: BandLayout) => {
  const full = (isWorking ? art.work[tick % art.work.length] : undefined) ?? art.idle
  const [from, to] = usedColumns(art)
  return encodeFrame(
    layout === 'small'
      ? cropColumns(halve(full), Math.floor(from / 2), Math.floor(to / 2))
      : cropColumns(full, from, to),
  )
}

export const register: Register = on => {
  let characters: Character[] = []
  /** 턴마다 문구 시작점을 바꾼다 */
  let offset = 0
  let timer: Timer | null = null

  /** 컴퓨터 언어 (세션 시작 때 읽는다). 설정의 lang이 있으면 그쪽이 먼저 */
  let systemLang: Lang = 'en'
  let lang = (): Lang => systemLang
  const langOf = (settings: Settings): Lang => settings.lang ?? systemLang
  /** 저장된 캐릭터가 없으면 다람쥐, 그것도 없으면 첫 캐릭터 */
  const currentOf = (settings: Settings): Character | null =>
    characters.find(ch => ch.meta.id === settings.character) ??
    characters.find(ch => ch.meta.id === DEFAULT_SETTINGS.character) ??
    characters[0] ??
    null
  const nameFor = (ch: Character | null) => (ch === null ? 'dotchi' : nameOf(ch.meta, lang()))
  const linesFor = (ch: Character | null) => (ch === null ? NO_LINES : pickLines(ch.lines, lang()))
  const status = (settings: Settings) =>
    t('status', {
      name: nameFor(currentOf(settings)),
      show: t(`show.${settings.show}`),
      voice: t(settings.voice ? 'voiceOn' : 'voiceOff'),
    })
  const changed = (settings: Settings) => t('changed', { status: status(settings) })

  const perLineFor = (ch: Character | null) => ticksPerLine(ch === null ? 250 : frameMsOf(ch.meta))

  /** 말풍선에 쓸 말: 일하는 중이면 일하는 문구, 쉬면 쉬는 문구 */
  const wordsFor = (settings: Settings, isWorking: boolean, tick: number) => {
    const ch = currentOf(settings)
    const set = linesFor(ch)
    return isWorking ? spinnerLine(set, nameFor(ch), tick, offset, perLineFor(ch)) : idleLine(set, nameFor(ch), offset)
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dotchi', description: 'Your pixel pet: switch, hatch, install, show' })
    const saved = await loadSettings($)
    systemLang = detectLang({
      LC_ALL: await $.env.get('LC_ALL'),
      LC_MESSAGES: await $.env.get('LC_MESSAGES'),
      LANG: await $.env.get('LANG'),
    })
    lang = () => langOf(saved)
    characters = await loadCharacters($)
    if (saved.show === 'side') await openPane($, PANE_COLUMNS)

    return next(e)
  })

  // /clear, /resume, /branch는 세션 상태를 기본값으로 되돌린다 (session.start는 다시 오지 않는다):
  // 저장된 설정을 다시 읽고, 옆 패널 모드였으면 패널 상태도 되살린다
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    const saved = await loadSettings($)
    lang = () => langOf(saved)
    characters = await loadCharacters($)
    if (saved.show === 'side') await openPane($, PANE_COLUMNS)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'dotchi' }, async ($, e) => {
    const current = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(current)
    const command = parseDotchi(e.args, (await $.env.get('HOME')) ?? '')

    switch (command.kind) {
      case 'status':
        return { text: status(current) }
      case 'usage':
        return { text: t('usage') }
      case 'list': {
        characters = await loadCharacters($)
        const active = currentOf(current)?.meta.id
        const rows = characters.map(ch =>
          t('listItem', {
            mark: ch.meta.id === active ? '▶ ' : '  ',
            id: ch.meta.id,
            name: nameFor(ch),
            origin: t(`origin.${ch.origin}`),
          }),
        )
        return { text: rows.join('\n') }
      }
      case 'switch': {
        // 캐릭터를 고를 때마다(지금 캐릭터여도) 팩을 다시 읽는다: 고친 그림이 바로 보이게
        characters = await loadCharacters($)
        const ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        const settings = { ...current, character: ch.meta.id }
        $.ui.invalidate('ui.render')
        await saveSettings($, settings)
        return { text: changed(settings) }
      }
      case 'voice': {
        const settings = { ...current, voice: command.on }
        await saveSettings($, settings)
        return { text: changed(settings) }
      }
      case 'install': {
        characters = await loadCharacters($)
        const result = await installPack($, command.path, new Set(characters.map(ch => ch.meta.id)))
        if ('error' in result) {
          const { error } = result
          const reason = t(`reason.${error.reason}`, {
            path: 'path' in error ? error.path : '',
            file: 'file' in error ? error.file : '',
          })
          return { text: t('installFailed', { reason }) }
        }
        characters = await loadCharacters($)
        const vars = { id: result.id, name: nameFor(result.character) }
        return { text: t(result.renamed ? 'installedRenamed' : 'installed', vars) }
      }
      case 'export': {
        characters = await loadCharacters($)
        const ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        const out = await exportPack($, ch, command.withSource)
        return { text: out === null ? t('exportFailed') : t('exported', { path: out }) }
      }
      case 'remove': {
        characters = await loadCharacters($)
        const ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        if (ch.origin === 'builtin' || !ch.dir.startsWith(await dataDir($))) {
          return { text: t('cannotRemoveBuiltin', { id: ch.meta.id }) }
        }
        await removePack($, ch)
        characters = await loadCharacters($)
        if (current.character === ch.meta.id) {
          await saveSettings($, { ...current, character: DEFAULT_SETTINGS.character })
          $.ui.invalidate('ui.render')
        }
        return { text: t('removed', { id: ch.meta.id }) }
      }
      case 'hatch': {
        const template = await readPrompt($, 'tools/hatch-prompt.md')
        if (template === null) return { text: t('promptMissing', { file: 'tools/hatch-prompt.md' }) }
        const text = fill(template, {
          root: $.plugin.root,
          data: await dataDir($),
          lang: lang(),
          langName: LANG_NAMES[lang()],
          image: command.image ?? '',
        })
        await handToClaude($, text, t('promptMissing', { file: 'prompt' }))
        return { text: t('hatchStarted') }
      }
      case 'edit': {
        characters = await loadCharacters($)
        const ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        const template = await readPrompt($, 'tools/edit-prompt.md')
        if (template === null) return { text: t('promptMissing', { file: 'tools/edit-prompt.md' }) }
        const dir = ch.origin === 'builtin' ? await copyToUser($, ch) : ch.dir
        const text = fill(template, {
          root: $.plugin.root,
          data: await dataDir($),
          lang: lang(),
          langName: LANG_NAMES[lang()],
          id: ch.meta.id,
          name: safeName(nameFor(ch), ch.meta.id),
          dir,
        })
        await handToClaude($, text, t('promptMissing', { file: 'prompt' }))
        return { text: t('editStarted', { name: nameFor(ch) }) }
      }
      case 'lang': {
        const settings = { ...current, lang: command.lang }
        lang = () => langOf(settings)
        $.ui.invalidate('ui.render')
        await saveSettings($, settings)
        return { text: changed(settings) }
      }
      case 'show': {
        const settings = { ...current, show: command.mode }
        await saveSettings($, settings)
        if (settings.show === 'side' && !(await read($, paneAtom))) {
          // 터미널 너비의 20%: 왼쪽 80%는 Claude 답변
          const width = e.presentation?.columns ?? PANE_COLUMNS * 5
          await openPane($, Math.max(30, Math.round(width * 0.2)))
        } else if (settings.show !== 'side' && current.show === 'side') {
          await $.ui.close({ id: PANE })
          await update($, paneAtom, () => false)
        }
        return { text: changed(settings) }
      }
    }
  })

  on('ui.close', async ($, e, next) => {
    // 사람이 패널을 닫으면 입력창 위 띠로 돌아간다
    if (e.id === PANE) await update($, paneAtom, () => false)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      offset = Math.floor(Math.random() * 1000)
      timer?.cancel()
      // 지금 캐릭터의 속도로 컷을 넘긴다 (거북이처럼 빠른 캐릭터도 있다)
      const ch = currentOf(normalizeSettings(await read($, settingsAtom)))
      timer = $.clock.every(ch === null ? 250 : frameMsOf(ch.meta), () => void update($, tickAtom, n => n + 1))
      await update($, workingAtom, () => true)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    timer?.cancel()
    timer = null
    await update($, tickAtom, () => 0)
    await update($, workingAtom, () => false)

    const result = await next(e)
    const settings = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(settings)
    if (!settings.voice || e.reason !== 'answer' || e.answer.trim() === '') return result
    const sound = endingLine(linesFor(currentOf(settings)), Math.random())
    return sound === null ? result : { ...result, text: sound }
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const settings = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(settings)
    const ch = currentOf(settings)
    if (linesFor(ch).spinner.length === 0) return next(e)
    const tick = Number(await read($, tickAtom))
    return next({ ...e, props: { ...e.props, word: spinnerLine(linesFor(ch), nameFor(ch), tick, offset, perLineFor(ch)) } })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const settings = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(settings)
    const { isWorking, hasSurvey, maxRows, bodyColumns } = e.props
    if (hasSurvey || (settings.show === 'working' && !isWorking)) return next(e)
    // 옆 패널이 떠 있으면 캐릭터가 두 번 나오지 않게 띠는 비운다
    if (settings.show === 'side' && (await read($, paneAtom))) return next(e)

    const tick = Number(await read($, tickAtom))
    const { Box, Text } = $.ui.resolve(e)
    const bubble = (
      <Box borderStyle="round" paddingX={1}>
        <Text>{wordsFor(settings, isWorking, tick)}</Text>
      </Box>
    )
    const art = currentOf(settings)?.art ?? null
    const layout = bandLayout(maxRows, bodyColumns, e.surface, e.viewport?.isFullscreen ?? false)
    if (art === null || layout === 'text' || e.surface !== 'terminal') return bubble

    const { Raster } = $.ui.resolve(e)
    const dots = dotsFor(art, isWorking, tick, layout)

    // 만화 말풍선: 머리 오른쪽 위에 띄우고, 아래 꼬리가 캐릭터 쪽(왼쪽 아래)을 가리킨다
    return (
      <Box flexDirection="row" alignItems="flex-start">
        <Raster key="dots" columns={dots.columns} rows={dots.rows} cells={dots.cells} />
        <Box flexDirection="column">
          {bubble}
          <Text>{' ╱'}</Text>
          <Text>{'╱'}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const settings = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(settings)
    const isWorking = Boolean(await read($, workingAtom))
    const tick = Number(await read($, tickAtom))
    const { bodyColumns, scroll } = e.props
    const { Box, Text } = $.ui.resolve(e)
    const bubble = (
      <Box borderStyle="round" paddingX={1}>
        <Text wrap="wrap">{wordsFor(settings, isWorking, tick)}</Text>
      </Box>
    )
    const art = currentOf(settings)?.art ?? null
    const layout = paneLayout(bodyColumns, scroll.bodyRows, e.surface)
    if (art === null || layout === 'text' || e.surface !== 'terminal') return bubble

    const { Raster } = $.ui.resolve(e)
    const dots = dotsFor(art, isWorking, tick, layout)

    // 세로로 긴 패널: 말풍선이 머리 위에 뜨고 꼬리가 아래 캐릭터를 가리킨다. 캐릭터는 바닥(입력창 쪽)에 선다
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="flex-end" height={scroll.bodyRows}>
        {bubble}
        <Text>{'╲'}</Text>
        <Raster key="dots" columns={dots.columns} rows={dots.rows} cells={dots.cells} />
      </Box>
    )
  })
}

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer, UiNotifyResult } from 'claude-code'

import type { Art, ArtifactLink, Character, GitState, Lang, LineSet, Look, Meter, Settings, Theme } from '../types'
import { cropColumns, encodeFrame, halve, stageArt, usedColumns } from './dots'
import { detectLang, LANG_NAMES, t } from './i18n'
import type { BandLayout } from './layout'
import { bandLayout, paneLayout } from './layout'
import {
  bundlePack,
  copyToUser,
  dataDir,
  exportPack,
  fetchRemotePack,
  installPack,
  loadCharacters,
  removePack,
  renamePack,
  resolveCharacter,
} from './library'
import { endingLine, idleLine, spinnerLine } from './lines'
import { frameMsOf, isId, nameOf, pickLines, ticksPerLine } from './packs'
import { parseStatus } from './gitstat'
import { addArtifact, artifactOf, gitLines, parseArtifacts } from './info'
import { accentOf, cardOf, DEFAULT_ICON, iconOf, meterOf, parseNumstat, stars, statusLine, textCols } from './meter'
import type { LimitAlert, LimitSeen } from './limits'
import { limitAlert } from './limits'
import type { AlbumEntry, Grow, Reading, Stage } from './grow'
import { noteStage, observe, parseGrow, recordAnswer, recordCost, recordPat, seen, shownStage, weekStage } from './grow'
import { shouldWarnRest } from './rest'
import { DEFAULT_SETTINGS, normalizeSettings, parseDotchi } from './settings'
import type { TalkKey } from './talk'
import { duration, say, tokens, when } from './talk'
import {
  PACKS_REPO,
  petPage,
  remoteIdOf,
  remoteThemeIdOf,
  shareBody,
  SITE,
  suggestId,
  takenOf,
  takenThemesOf,
  themePage,
  themeShareBody,
  themeUnshareBody,
  unshareBody,
} from './share'
import { DEFAULT_LOOK, DEFAULT_THEME_ID, isThemeId, setThemeKey, THEME_KEYS, themeNameOf } from './theme'
import {
  exportTheme,
  fetchRemoteTheme,
  installThemePath,
  installThemeText,
  loadThemes,
  readThemeJson,
  removeTheme,
  resolveTheme,
  writeTheme,
} from './themes'
import type { ThemeInstall } from './themes'

const settingsAtom = atom({ plugin: 'dotchi', key: 'settings' } as const, DEFAULT_SETTINGS)
const tickAtom = atom({ plugin: 'dotchi', key: 'tick' } as const, 0)
const workingAtom = atom({ plugin: 'dotchi', key: 'working' } as const, false)
const paneAtom = atom({ plugin: 'dotchi', key: 'paneShown' } as const, false)
const gitAtom = atom({ plugin: 'dotchi', key: 'git' } as const, null as GitState | null)
const artifactsAtom = atom({ plugin: 'dotchi', key: 'artifacts' } as const, [] as ArtifactLink[])
const touchedAtom = atom({ plugin: 'dotchi', key: 'touched' } as const, [] as string[])
const alertAtom = atom({ plugin: 'dotchi', key: 'alert' } as const, null as { text: string; until: number } | null)
const meterAtom = atom({ plugin: 'dotchi', key: 'meter' } as const, null as Meter | null)
const minuteAtom = atom({ plugin: 'dotchi', key: 'minute' } as const, 0)
const stageAtom = atom({ plugin: 'dotchi', key: 'stage' } as const, 1 as Stage)
/** 쓰다듬은 하트를 이 시각(ms)까지 보인다. 0이면 없음 */
const pettedAtom = atom({ plugin: 'dotchi', key: 'petted' } as const, 0)
const PAT_MS = 2000

/** 쓰다듬기: 앨범 재료에 한 번, 2초 동안 하트, 기분 좋은 말 */
async function pat($: EngineInterface, text: string): Promise<void> {
  await growWith($, recordPat)
  const until = (await $.clock.now()) + PAT_MS
  await update($, pettedAtom, () => until)
  await showAlert($, text)
  $.clock.after(PAT_MS, () => void update($, pettedAtom, n => (n <= until ? 0 : n)))
}

/** 진화 상태를 읽고-바꾸고-쓰기를 한 줄로 세운다 (측정·턴·쓰다듬기가 겹쳐도 잃지 않게) */
let growLock: Promise<unknown> = Promise.resolve()
async function growWith($: EngineInterface, fn: (grow: Grow) => Grow | Promise<Grow>): Promise<Grow> {
  const turn = growLock.then(async () => {
    const next = await fn(parseGrow(await $.store.get('grow')))
    await $.store.set('grow', next)
    return next
  })
  growLock = turn.catch(() => undefined)
  return turn
}

/** 가장 최근의 주간 한도 읽기 (아직 없으면 none) */
let lastReading: Reading = { kind: 'none' }

/**
 * 읽기를 반영해 단계를 다시 정한다. announce면 이번 주에 처음 오른 단계를 말한다
 * (보이는 단계가 실제로 올랐을 때만: 리셋을 끈 사람의 펫은 이미 큰 단계일 수 있다)
 */
async function refreshStage(
  $: EngineInterface,
  announce: boolean,
  evolvedText: (settings: Settings, stage: Stage) => string,
  fresh: Reading = { kind: 'none' },
): Promise<void> {
  const settings = normalizeSettings(await read($, settingsAtom))
  const now = await $.clock.now()
  const before = Number(await read($, stageAtom)) as Stage
  let evolved: Stage | null = null
  const grow = await growWith($, g => {
    // 주 넘김은 방금 온 측정(fresh)으로만: 이 세션의 오래된 읽기는 다른 세션이 쓴 값보다 낮을 수 있다
    const observed = observe(g, fresh, now, settings.character).grow
    const noted = noteStage(observed, weekStage(observed, lastReading, settings.grow.budgetUsd, now))
    evolved = noted.evolved
    return noted.grow
  })
  const stage = shownStage(grow, lastReading, settings.grow, now)
  await update($, stageAtom, () => stage)
  if (announce && evolved !== null && stage > before) {
    const text = evolvedText(settings, stage)
    await showAlert($, text)
    $.ui.toast(text)
  }
}

/** 측정의 한도 창들 → 진화 읽기 (주간 창이 없으면 none) */
const readingOf = (windows: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Reading => {
  const week = windows.find(w => w.kind === 'seven_day')
  return week === undefined ? { kind: 'none' } : { kind: 'limit', percent: week.percentUsed, resetsAt: week.resetsAt ?? null }
}

/** /dotchi notify fix가 고르는 알림 경로 */
const NOTIFY_CHANNEL = 'iterm2_with_bell'

/** 경고 말풍선이 떠 있는 시간 */
const ALERT_MS = 10000

/** 옆 패널의 id와, 너비를 모를 때 쓰는 칸 수 */
const PANE = 'dotchi'
const PANE_COLUMNS = 48
/** 옆 패널에서 펫(작은 그림 + 말풍선)에게 남겨 두는 줄 수 */
const PET_MIN_ROWS = 14
const NO_LINES: LineSet = { spinner: [], idle: [], ending: [] }

/** 경고 말풍선을 띄운다. 10초 뒤나 사용자가 메시지를 보내면 사라진다 */
async function showAlert($: EngineInterface, text: string): Promise<void> {
  const until = (await $.clock.now()) + ALERT_MS
  await update($, alertAtom, () => ({ text, until }))
  $.clock.after(ALERT_MS, () => void update($, alertAtom, a => (a !== null && a.until <= until ? null : a)))
}

/** git을 다시 읽는 간격 */
const GIT_EVERY_MS = 30000
/** 파일을 바꿀 수 있는 도구: 끝나면 git을 다시 읽는다 */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
/** git을 읽는 중이면 또 읽지 않고, 끝난 뒤 한 번 더 읽는다 (몰리면 한 번으로, 오래된 목록을 남기지 않게) */
let gitBusy = false
let gitDirty = false
/** 저장소 뿌리 (Claude가 고친 파일의 경로를 git 경로로 바꿀 때) */
let repoRoot: string | null = null
/** 캐릭터 id → 상태 줄 아이콘. register가 캐릭터 목록을 읽은 뒤 채운다 */
let iconFor: (id: string) => string = () => DEFAULT_ICON
/** 테마 id → 모양. register가 테마 목록을 읽은 뒤 채운다 */
let lookFor: (id: string) => Look = () => DEFAULT_LOOK
/** 이 세션을 켠(또는 /clear 한) 시각: 상태 줄의 지난 시간 */
let sessionBegan: number | null = null

/** git 상태를 다시 읽고 상태 줄을 맞춘다. 저장소가 아니거나 git이 없으면 git 영역을 숨긴다 */
async function refreshGit($: EngineInterface, lang: Lang): Promise<void> {
  if (gitBusy) {
    gitDirty = true
    return
  }
  gitBusy = true
  try {
    do {
      gitDirty = false
      const cwd = await $.session.cwd()
      // --no-optional-locks: 상태를 읽다가 index.lock을 잡아 Claude의 git 명령(commit 등)을 막지 않게
      const run = (args: string[]) =>
        $.process.run(['git', '--no-optional-locks', '-c', 'core.quotePath=false', ...args], { cwd, timeoutMs: 5000 }).catch(() => null)
      const status = await run(['status', '--porcelain=v2', '--branch'])
      if (status === null || status.exitCode !== 0) {
        repoRoot = null
        await update($, gitAtom, () => null)
      } else {
        if (repoRoot === null) {
          const top = await run(['rev-parse', '--show-toplevel'])
          repoRoot = top !== null && top.exitCode === 0 ? top.stdout.trim() : cwd
        }
        // 커밋하지 않은 변경의 줄 수. 커밋이 하나도 없으면(HEAD 없음) 줄 수만 모른다
        const numstat = await run(['diff', '--numstat', 'HEAD'])
        const lines = numstat !== null && numstat.exitCode === 0 ? parseNumstat(numstat.stdout) : null
        await update($, gitAtom, () => ({ ...parseStatus(status.stdout), ...(lines ?? {}) }))
      }
    } while (gitDirty)
  } finally {
    gitBusy = false
  }
  await syncStatus($, lang)
}

/** 상태 줄: 옆 패널이 떠 있으면 패널에 다 나오므로 지운다. 꺼 두었어도 지운다 */
async function syncStatus($: EngineInterface, lang: Lang): Promise<void> {
  const settings = normalizeSettings(await read($, settingsAtom))
  const now = await $.clock.now()
  // 패널의 지난 시간이 1분마다 바뀌게
  await update($, minuteAtom, () => Math.floor(now / 60000))
  const paneShown = Boolean(await read($, paneAtom))
  if (paneShown || settings.line === 'off') {
    $.ui.status(undefined)
    return
  }
  $.ui.status(
    statusLine({
      meter: await read($, meterAtom),
      git: await read($, gitAtom),
      artifacts: await read($, artifactsAtom),
      icon: iconFor(settings.character),
      mode: settings.line,
      cost: settings.cost,
      elapsedMs: sessionBegan === null ? 0 : now - sessionBegan,
      lang,
      gauge: settings.gauge,
      look: lookFor(settings.theme),
      stage: Number(await read($, stageAtom)) as Stage,
    }),
  )
}

/** 계기(컨텍스트·주간·비용·모델)를 다시 읽는다. 측정 훅이 준 값이 있으면 그것을 쓴다 */
async function refreshMeter($: EngineInterface, measured?: Parameters<typeof meterOf>[0]): Promise<Meter | null> {
  const usage = measured ?? (await $.session.usage().catch(() => null))
  if (usage === null) return null
  const model = await $.session.model().catch(() => null)
  const meter = meterOf(usage, model, await $.clock.now())
  await update($, meterAtom, () => meter)
  return meter
}

/** 이 세션의 아티팩트 목록을 저장소에서 읽는다 */
async function loadArtifacts($: EngineInterface): Promise<void> {
  const saved = parseArtifacts(await $.store.get(`artifacts:${await $.session.id()}`))
  await update($, artifactsAtom, () => saved)
}

/** 이 세션의 마지막 턴 시각 (저장된 것). 없으면 null */
async function loadLastTurn($: EngineInterface): Promise<number | null> {
  const saved = await $.store.get(`lastTurnAt:${await $.session.id()}`)
  return typeof saved === 'number' && Number.isFinite(saved) ? saved : null
}

/**
 * 긴 작업이 끝났다: 데스크톱 알림 + 말풍선.
 * 알림이 갈 길이 없으면(no-channel) 말풍선으로 고치는 법(hint)을 대신 말한다
 */
async function notifyDone($: EngineInterface, title: string, text: string, hint: string | null): Promise<UiNotifyResult | null> {
  const sent = await $.ui.notify(text, { title }).catch(() => null)
  const noChannel = sent?.isSent === false && sent.reason === 'no-channel'
  await showAlert($, noChannel && hint !== null ? hint : text)
  return sent
}

/** 지금 떠 있는 경고 말풍선의 글. 없으면 null */
async function activeAlert($: EngineInterface): Promise<string | null> {
  const alert = await read($, alertAtom)
  return alert === null ? null : alert.text
}


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

/** gh가 쓸 수 있는지: 없거나(실행 못 함, 127) 로그인 안 됨 */
async function ghStatus($: EngineInterface): Promise<'ok' | 'missing' | 'loggedOut'> {
  const result = await $.process.run(['gh', 'auth', 'status']).catch(() => null)
  if (result === null || result.exitCode === 127) return 'missing'
  return result.exitCode === 0 ? 'ok' : 'loggedOut'
}

/** gh로 펫 보관 저장소에 Issue를 연다. 성공하면 Issue 주소, 실패하면 오류 첫 줄 */
async function openIssue($: EngineInterface, title: string, body: string): Promise<{ url: string } | { reason: string }> {
  const result = await $.process
    .run(['gh', 'issue', 'create', '--repo', PACKS_REPO, '--title', title, '--body-file', '-'], { stdin: body, timeoutMs: 60000 })
    .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  const lines = (text: string) => text.split('\n').map(line => line.trim()).filter(Boolean)
  const url = lines(result.stdout).at(-1)
  if (result.exitCode === 0 && url !== undefined) return { url }
  return { reason: lines(result.stderr)[0] ?? `gh exited with ${result.exitCode}` }
}

/**
 * 사이트에서 다른 사람이 이미 쓰는 id인지 (펫은 taken, 테마는 takenThemes).
 * 사이트나 gh에 물을 수 없으면 모른다고(false) 본다
 */
async function takenByOther(
  $: EngineInterface,
  id: string,
  of: (indexJson: string) => Record<string, number> | null = takenOf,
): Promise<Record<string, number> | null> {
  const response = await $.http.fetch(`${SITE}/index.json`).catch(() => null)
  const taken = response?.ok ? of(response.text) : null
  if (taken === null || taken[id] === undefined) return null
  const me = await $.process.run(['gh', 'api', 'user', '--jq', '.id']).catch(() => null)
  const myId = me?.exitCode === 0 ? Number(me.stdout.trim()) : NaN
  return Number.isFinite(myId) && taken[id] !== myId ? taken : null
}

/** 기본 테마를 고치기 전에 내 폴더에 같은 id로 복사한다 */
async function copyThemeToUser($: EngineInterface, theme: Theme): Promise<Theme | null> {
  const json = await readThemeJson($, theme)
  return json === null ? null : writeTheme($, json)
}

/** 그림 한 컷을 Raster 칸으로: 양옆 빈칸은 잘라 말풍선을 머리에 붙인다 */
const dotsFor = (art: Art, stage: Stage, isWorking: boolean, tick: number, layout: BandLayout) => {
  const cuts = stageArt(art, stage)
  const full = (isWorking ? cuts.work[tick % cuts.work.length] : undefined) ?? cuts.idle
  const [from, to] = usedColumns(art)
  return encodeFrame(
    layout === 'small'
      ? cropColumns(halve(full), Math.floor(from / 2), Math.floor(to / 2))
      : cropColumns(full, from, to),
  )
}

export const register: Register = on => {
  let characters: Character[] = []
  /** 상태 줄 테마들 (기본 + 내 것) */
  let themes: Theme[] = []
  /** 저장된 테마가 없으면 파스텔, 그것도 없으면 코드의 기본 모양 */
  const themeOf = (id: string): Theme | null =>
    themes.find(theme => theme.meta.id === id) ?? themes.find(theme => theme.meta.id === DEFAULT_THEME_ID) ?? null
  lookFor = id => themeOf(id)?.look ?? DEFAULT_LOOK
  /** 턴마다 문구 시작점을 바꾼다 */
  let offset = 0
  let timer: Timer | null = null
  /** git을 30초마다 다시 읽는 타이머 */
  let gitTimer: Timer | null = null
  /** 도찌가 보낸 마지막 알림의 결과 (/dotchi에 알림 경로를 보여 줄 때) */
  let lastNotify: UiNotifyResult | null = null
  /** '알림이 안 가고 있어요'는 세션마다 한 번만 */
  let hintedNoChannel = false
  /** 이 세션의 마지막 (메인) 턴이 끝난 시각. 다시 연 세션은 저장된 값 */
  let lastTurnAt: number | null = null
  /** 한도 측정을 한 번에 하나씩 처리하는 줄 */
  let measureLock: Promise<void> = Promise.resolve()
  /** 쉬고 돌아왔을 때 경고는 쉴 때마다 한 번만 */
  let restWarned = false
  /** '배가 꽉 찼어요'는 위험 기준(기본 90%)을 넘을 때 한 번. 5 넘게 내려가면(/compact) 다시 */
  let stuffedWarned = false
  /** 쓰다듬었을 때의 말: 셋 중 하나 */
  const patText = () => talk((['pat1', 'pat2', 'pat3'] as const)[Math.floor(Math.random() * 3)]!)

  /** 진화 알림 글: 지금 언어로 */
  const evolvedText = (settings: Settings, stage: Stage) => {
    lang = () => langOf(settings)
    const name = nameFor(currentOf(settings))
    // 3단계는 상이 아니라 '이제 아껴 쓰자'는 신호
    return stage === 3 ? talk('grownUp', { name }) : talk('evolved', { name, stage: String(stage) })
  }

  /** /dotchi grow 응답 */
  const growText = (grow: Grow, settings: Settings): string => {
    const stage = shownStage(grow, lastReading, settings.grow)
    const week = grow.week
    // 다음 단계 안내는 함께한 날 수에만: 사용량(한도·예산)을 목표처럼 내밀지 않는다
    const next = (at: string) => (weekStage(grow, lastReading, settings.grow.budgetUsd) < 3 ? t('growNext', { at }) : '')
    const thresholds = (s: Stage, a: string, b: string) => (s === 1 ? a : b)
    const current = weekStage(grow, lastReading, settings.grow.budgetUsd)
    let detail: string
    if (lastReading.kind === 'limit' || grow.source === 'limit') {
      const percent = lastReading.kind === 'limit' ? lastReading.percent : (week?.limit?.percent ?? 0)
      detail = t('growLimit', { percent: String(Math.floor(percent)) })
    } else if (settings.grow.budgetUsd !== null) {
      detail = t('growBudget', { spent: (week?.spentUsd ?? 0).toFixed(2), budget: String(settings.grow.budgetUsd) })
    } else {
      detail = t('growDays', { days: String(week?.days.length ?? 0) }) + next(thresholds(current, '2 days', '4 days'))
    }
    return [
      t('growStage', { stage: String(stage), detail }),
      t('growRule', {
        reset: settings.grow.reset ? 'on' : 'off',
        budget: settings.grow.budgetUsd === null ? 'off' : `$${settings.grow.budgetUsd}`,
      }),
    ].join('\n')
  }

  /** 앨범 한 줄 */
  const albumLine = (entry: AlbumEntry): string => {
    const ch = characters.find(c => c.meta.id === entry.pet)
    const style = entry.style === null ? null : t(entry.style === 'owl' ? 'albumOwl' : entry.style === 'morning' ? 'albumMorning' : 'albumDay')
    return [entry.start, ch === undefined ? entry.pet : nameFor(ch), '★'.repeat(entry.stage) + '☆'.repeat(3 - entry.stage), `♥ ${entry.pats}`, style]
      .filter((part): part is string => part !== null)
      .join(' · ')
  }

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
  iconFor = id => iconOf(currentOf({ ...DEFAULT_SETTINGS, character: id })?.meta ?? null)
  const linesFor = (ch: Character | null) => (ch === null ? NO_LINES : pickLines(ch.lines, lang()))
  const status = (settings: Settings) =>
    t('status', {
      name: nameFor(currentOf(settings)),
      show: t(`show.${settings.show}`),
      voice: t(settings.voice ? 'voiceOn' : 'voiceOff'),
    })
  const changed = (settings: Settings) => t('changed', { status: status(settings) })

  /** 펫이 하는 말: 지금 언어로 */
  const talk = (key: TalkKey, vars: Record<string, string> = {}) => say(lang(), key, vars)
  const limitText = (alert: LimitAlert) => {
    const percent = String(Math.floor(alert.percent))
    if (alert.resetsAt === null) return talk('limitBare', { percent })
    const reset = when(lang(), alert.resetsAt)
    if (alert.emptyAt !== null) return talk('limitForecast', { percent, reset, empty: when(lang(), alert.emptyAt) })
    return talk('limit', { percent, reset })
  }

  const perLineFor = (ch: Character | null) => ticksPerLine(ch === null ? 250 : frameMsOf(ch.meta))

  /** 말풍선에 쓸 말: 일하는 중이면 일하는 문구, 쉬면 쉬는 문구 */
  const wordsFor = (settings: Settings, isWorking: boolean, tick: number) => {
    const ch = currentOf(settings)
    const set = linesFor(ch)
    return isWorking ? spinnerLine(set, nameFor(ch), tick, offset, perLineFor(ch)) : idleLine(set, nameFor(ch), offset)
  }

  on('session.start', async ($, e, next) => {
    hintedNoChannel = false
    restWarned = false
    stuffedWarned = false
    sessionBegan = await $.clock.now()
    lastTurnAt = await loadLastTurn($)
    await $.command.register({ name: 'dotchi', description: 'Your pixel pet: switch, hatch, install, show' })
    const saved = await loadSettings($)
    systemLang = detectLang({
      LC_ALL: await $.env.get('LC_ALL'),
      LC_MESSAGES: await $.env.get('LC_MESSAGES'),
      LANG: await $.env.get('LANG'),
    })
    lang = () => langOf(saved)
    characters = await loadCharacters($)
    themes = await loadThemes($)
    if (saved.show === 'side') await openPane($, PANE_COLUMNS)
    await loadArtifacts($)
    // 진화: 하루 넘게 못 봤으면 반기고, 이번 주 단계를 조용히 맞춘다
    lastReading = readingOf((await $.session.usage().catch(() => null))?.rateLimits ?? [])
    const now = await $.clock.now()
    // 세션 시작의 읽기는 방금 온 것이라 주 넘김에도 쓴다
    let welcome = false
    await growWith($, g => {
      const result = seen(g, now)
      welcome = result.welcome
      return result.grow
    })
    if (welcome) await showAlert($, talk('welcome'))
    await refreshStage($, false, evolvedText, lastReading)
    gitTimer?.cancel()
    gitTimer = $.clock.every(GIT_EVERY_MS, () => void refreshGit($, lang()).catch(() => undefined))
    // 큰 저장소에서도 세션 시작을 붙잡지 않게 기다리지 않는다
    void refreshMeter($)
      .then(() => refreshGit($, lang()))
      .catch(() => undefined)

    return next(e)
  })

  // /clear, /resume, /branch는 세션 상태를 기본값으로 되돌린다 (session.start는 다시 오지 않는다):
  // 저장된 설정을 다시 읽고, 옆 패널 모드였으면 패널 상태도 되살린다
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    restWarned = false
    stuffedWarned = false
    sessionBegan = await $.clock.now()
    lastTurnAt = await loadLastTurn($)
    const saved = await loadSettings($)
    lang = () => langOf(saved)
    characters = await loadCharacters($)
    themes = await loadThemes($)
    if (saved.show === 'side') await openPane($, PANE_COLUMNS)
    await update($, touchedAtom, () => [])
    await loadArtifacts($)
    // 세션 상태가 지워졌다: 진화 단계를 저장된 값에서 다시 맞춘다
    lastReading = readingOf((await $.session.usage().catch(() => null))?.rateLimits ?? [])
    await refreshStage($, false, evolvedText, lastReading)
    await syncStatus($, lang())
    void refreshMeter($)
      .then(() => refreshGit($, lang()))
      .catch(() => undefined)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'dotchi' }, async ($, e) => {
    const current = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(current)
    const command = parseDotchi(e.args, (await $.env.get('HOME')) ?? '')

    switch (command.kind) {
      case 'status': {
        const usage = await $.session.usage().catch(() => null)
        const week = usage?.rateLimits.find(w => w.kind === 'seven_day')
        const reset = week?.resetsAt === undefined ? '' : ` (resets ${when('en', Date.parse(week.resetsAt))})`
        const used = usage?.context.tokens
        const percent = usage?.context.percent
        const channel =
          lastNotify === null
            ? 'channel unknown until the first one'
            : lastNotify.isSent
              ? `channel ${lastNotify.channel}`
              : `not sent: ${lastNotify.reason}`
        const lines = [
          status(current),
          `Limit warning: ${current.limit ? 'on' : 'off'}${week === undefined ? '' : ` · weekly ${Math.floor(week.percentUsed)}%${reset}`}`,
          ...(used === undefined ? [] : [`Context: ${tokens(used)} tokens${percent === undefined ? '' : ` (${percent}%)`}`]),
          `Status line: ${current.line} · cost ${current.cost ? 'on' : 'off'} · theme ${themeOf(current.theme)?.meta.id ?? DEFAULT_THEME_ID}`,
          `Gauge: context ${current.gauge.context.warn}/${current.gauge.context.danger}% · week ${current.gauge.week.warn}/${current.gauge.week.danger}%`,
          current.notify ? `Notifications: on · after ${current.notifyAfterSec} s · ${channel}` : 'Notifications: off',
          current.rest
            ? `Rest warning: after ${current.rest.hours} h away and ${tokens(current.rest.tokens)} tokens`
            : 'Rest warning: off',
          t('growLine', {
            stage: String(await read($, stageAtom)),
            reset: current.grow.reset ? 'on' : 'off',
            budget: current.grow.budgetUsd === null ? 'off' : `$${current.grow.budgetUsd}`,
          }),
        ]
        return { text: lines.join('\n') }
      }
      case 'usage':
        return { text: t('usage') }
      case 'grow':
        return { text: growText(parseGrow(await $.store.get('grow')), current) }
      case 'growReset':
      case 'growBudget': {
        const grow = command.kind === 'growReset' ? { ...current.grow, reset: command.on } : { ...current.grow, budgetUsd: command.usd }
        const settings = { ...current, grow }
        await saveSettings($, settings)
        await refreshStage($, false, evolvedText)
        $.ui.invalidate('ui.render')
        await syncStatus($, lang())
        return { text: growText(parseGrow(await $.store.get('grow')), settings) }
      }
      case 'album': {
        characters = await loadCharacters($)
        const album = parseGrow(await $.store.get('grow')).album
        return { text: album.length === 0 ? t('albumEmpty') : [...album].reverse().map(albumLine).join('\n') }
      }
      case 'evolve': {
        characters = await loadCharacters($)
        const ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        const template = await readPrompt($, 'tools/evolve-prompt.md')
        if (template === null) return { text: t('promptMissing', { file: 'tools/evolve-prompt.md' }) }
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
        return { text: t('evolveStarted', { name: nameFor(ch) }) }
      }
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
      case 'limit':
      case 'notify': {
        const settings = { ...current, [command.kind]: command.on }
        await saveSettings($, settings)
        return { text: changed(settings) }
      }
      case 'line':
      case 'lineCost': {
        const settings = command.kind === 'line' ? { ...current, line: command.mode } : { ...current, cost: command.on }
        await saveSettings($, settings)
        await syncStatus($, lang())
        $.ui.invalidate('ui.render')
        return { text: changed(settings) }
      }
      case 'gauge': {
        const settings = { ...current, gauge: { ...current.gauge, [command.target]: command.at } }
        await saveSettings($, settings)
        // 기준이 바뀌면 '꽉 찼어요'를 새 기준으로 다시 말할 수 있게
        if (command.target === 'context') stuffedWarned = false
        await syncStatus($, lang())
        $.ui.invalidate('ui.render')
        return { text: changed(settings) }
      }
      case 'themeList': {
        themes = await loadThemes($)
        const active = themeOf(current.theme)?.meta.id
        const rows = themes.map(theme =>
          t('listItem', {
            mark: theme.meta.id === active ? '▶ ' : '  ',
            id: theme.meta.id,
            name: themeNameOf(theme.meta, lang()),
            origin: t(`origin.${theme.origin}`),
          }),
        )
        return { text: [...rows, t('themeHint')].join('\n') }
      }
      case 'themeSwitch': {
        themes = await loadThemes($)
        const theme = resolveTheme(command.target, themes)
        if (theme === null) return { text: t('unknownTheme', { arg: command.target }) }
        await saveSettings($, { ...current, theme: theme.meta.id })
        await syncStatus($, lang())
        $.ui.invalidate('ui.render')
        return { text: t('themeChanged', { name: themeNameOf(theme.meta, lang()), id: theme.meta.id }) }
      }
      case 'themeNew':
      case 'themeEdit': {
        themes = await loadThemes($)
        let dir = ''
        let id = ''
        if (command.kind === 'themeEdit') {
          const theme = command.target === null ? themeOf(current.theme) : resolveTheme(command.target, themes)
          if (theme === null) return { text: t('unknownTheme', { arg: command.target ?? current.theme }) }
          // 기본 테마는 내 폴더에 같은 id로 복사해서 고친다 (플러그인 폴더는 업데이트 때 바뀐다)
          const mine = theme.origin === 'user' ? theme : await copyThemeToUser($, theme)
          if (mine === null) return { text: t('themeSaveFailed') }
          dir = mine.dir
          id = mine.meta.id
          themes = await loadThemes($)
        }
        const template = await readPrompt($, 'tools/theme-prompt.md')
        if (template === null) return { text: t('promptMissing', { file: 'tools/theme-prompt.md' }) }
        const text = fill(template, {
          root: $.plugin.root,
          data: await dataDir($),
          lang: lang(),
          langName: LANG_NAMES[lang()],
          task:
            command.kind === 'themeNew'
              ? `make a new status-line theme${command.idea === null ? '' : `. My idea: "${safeName(command.idea, '')}"`}`
              : `change my status-line theme \`${id}\` (its file is ${dir}/theme.json)`,
          taken: themes.map(theme => theme.meta.id).join(', '),
        })
        await handToClaude($, text, t('promptMissing', { file: 'prompt' }))
        return { text: t(command.kind === 'themeNew' ? 'themeNewStarted' : 'themeEditStarted') }
      }
      case 'themeSet': {
        themes = await loadThemes($)
        const theme = themeOf(current.theme)
        if (theme === null) return { text: t('unknownTheme', { arg: current.theme }) }
        const json = await readThemeJson($, theme)
        if (json === null) return { text: t('themeSaveFailed') }
        const next = setThemeKey(json, command.key, command.value)
        if ('error' in next) {
          return {
            text:
              next.error === 'key'
                ? t('themeBadKey', { key: command.key, keys: THEME_KEYS.join(', ') })
                : t('themeBadValue', { key: command.key, value: command.value }),
          }
        }
        // 기본 테마를 고치면 같은 id의 내 테마가 생겨 기본 테마를 가린다
        const saved = await writeTheme($, next)
        if (saved === null) return { text: t('themeSaveFailed') }
        themes = await loadThemes($)
        await syncStatus($, lang())
        $.ui.invalidate('ui.render')
        return { text: t('themeSet', { key: command.key, id: saved.meta.id }) }
      }
      case 'themeInstall': {
        themes = await loadThemes($)
        const remoteId = (await $.fs.exists(command.path).catch(() => false)) ? null : remoteThemeIdOf(command.raw, isThemeId)
        let result: ThemeInstall
        if (remoteId === null) {
          result = await installThemePath($, command.path, themes)
        } else {
          const fetched = await fetchRemoteTheme($, remoteId)
          if ('error' in fetched) {
            return { text: t(fetched.error === 'notOnSite' ? 'themeNotOnSite' : 'siteUnreachable', { id: remoteId }) }
          }
          result = await installThemeText($, fetched.text, themes)
        }
        if ('error' in result) {
          const reason = result.error === 'notFound' ? t('reason.notFound', { path: command.path }) : t('reason.badTheme')
          return { text: t('installFailed', { reason }) }
        }
        if ('already' in result) {
          return { text: t('themeAlreadyHave', { id: result.already.meta.id, name: themeNameOf(result.already.meta, lang()) }) }
        }
        themes = await loadThemes($)
        const vars = { id: result.theme.meta.id, name: themeNameOf(result.theme.meta, lang()), wanted: result.wanted }
        return { text: t(result.renamed ? 'themeInstalledRenamed' : 'themeInstalled', vars) }
      }
      case 'themeExport': {
        themes = await loadThemes($)
        const theme = resolveTheme(command.target, themes)
        if (theme === null) return { text: t('unknownTheme', { arg: command.target }) }
        const out = await exportTheme($, theme)
        return { text: out === null ? t('themeSaveFailed') : t('exported', { path: out }) }
      }
      case 'themeShare': {
        themes = await loadThemes($)
        let theme = resolveTheme(command.target, themes)
        if (theme === null) return { text: t('unknownTheme', { arg: command.target }) }
        const gh = await ghStatus($)
        if (gh !== 'ok') return { text: t(gh === 'missing' ? 'ghMissing' : 'ghLoggedOut') }
        if (command.as !== null && command.as !== theme.meta.id) {
          if (!isThemeId(command.as)) return { text: t('asInvalid', { id: command.as }) }
          if (themes.some(other => other.meta.id === command.as)) return { text: t('themeAsExists', { id: command.as }) }
          const json = await readThemeJson($, theme)
          const renamed = json === null ? null : await writeTheme($, { ...json, id: command.as })
          if (renamed === null) return { text: t('themeSaveFailed') }
          if (theme.origin === 'user') await removeTheme($, theme)
          if (current.theme === theme.meta.id) await saveSettings($, { ...current, theme: renamed.meta.id })
          theme = renamed
          themes = await loadThemes($)
        }
        const id = theme.meta.id
        const taken = await takenByOther($, id, takenThemesOf)
        if (taken !== null) {
          const suggestion = suggestId(id, new Set([...Object.keys(taken), ...themes.map(other => other.meta.id)]))
          return { text: t('themeIdTaken', { id, target: id, suggestion }) }
        }
        const json = await readThemeJson($, theme)
        if (json === null) return { text: t('themeSaveFailed') }
        const name = themeNameOf(theme.meta, lang())
        const body = themeShareBody({ id, name, description: theme.meta.description, json: JSON.stringify(json) })
        const opened = await openIssue($, `theme-share: ${id}`, body)
        if ('reason' in opened) return { text: t('shareFailed', { reason: opened.reason }) }
        return { text: t('themeShared', { name, id, issue: opened.url, page: themePage(id) }) }
      }
      case 'themeUnshare': {
        themes = await loadThemes($)
        const id = resolveTheme(command.target, themes)?.meta.id ?? (isThemeId(command.target) ? command.target : null)
        if (id === null) return { text: t('usage') }
        const gh = await ghStatus($)
        if (gh !== 'ok') return { text: t(gh === 'missing' ? 'ghMissing' : 'ghLoggedOut') }
        const opened = await openIssue($, `theme-unshare: ${id}`, themeUnshareBody(id))
        if ('reason' in opened) return { text: t('shareFailed', { reason: opened.reason }) }
        return { text: t('unshareRequested', { id, issue: opened.url }) }
      }
      case 'themeRemove': {
        themes = await loadThemes($)
        const theme = resolveTheme(command.target, themes)
        if (theme === null) return { text: t('unknownTheme', { arg: command.target }) }
        if (theme.origin === 'builtin' || !theme.dir.startsWith(await dataDir($))) {
          return { text: t('cannotRemoveBuiltin', { id: theme.meta.id }) }
        }
        await removeTheme($, theme)
        themes = await loadThemes($)
        // 같은 id의 기본 테마가 남아 있으면(고친 기본 테마를 지운 경우) 그대로, 아니면 파스텔로
        if (current.theme === theme.meta.id && !themes.some(other => other.meta.id === theme.meta.id)) {
          await saveSettings($, { ...current, theme: DEFAULT_THEME_ID })
        }
        await syncStatus($, lang())
        $.ui.invalidate('ui.render')
        return { text: t('removed', { id: theme.meta.id }) }
      }
      case 'notifyAfter': {
        const settings = { ...current, notifyAfterSec: command.seconds }
        await saveSettings($, settings)
        return { text: changed(settings) }
      }
      case 'rest': {
        const settings = { ...current, rest: command.rest }
        await saveSettings($, settings)
        return { text: changed(settings) }
      }
      case 'notifyFix': {
        // 사용자가 Termius에서 확인한 경로: OSC 9 알림 + 벨
        const rows = await $.config.list().catch(() => [])
        const row = rows.find(r => /notif/i.test(r.key) && typeof r.value === 'string')
        const done = row === undefined ? null : await $.config.set({ key: row.key, value: NOTIFY_CHANNEL }).catch(() => null)
        if (row === undefined || done === null || 'deny' in done) return { text: t('notifyFixManual') }
        return { text: t('notifyFixed', { channel: NOTIFY_CHANNEL, old: String(row.value) }) }
      }
      case 'install': {
        characters = await loadCharacters($)
        // 있는 로컬 경로가 먼저. 없으면 사이트의 펫 id나 주소로 본다
        const remoteId = (await $.fs.exists(command.path).catch(() => false)) ? null : remoteIdOf(command.raw)
        let result
        if (remoteId === null) {
          result = await installPack($, command.path, characters)
        } else {
          const fetched = await fetchRemotePack($, remoteId)
          if ('error' in fetched) {
            return { text: t(fetched.error === 'notOnSite' ? 'notOnSite' : 'siteUnreachable', { id: remoteId }) }
          }
          try {
            result = await installPack($, fetched.dir, characters)
          } finally {
            await $.process.run(['rm', '-rf', fetched.tmp]).catch(() => undefined)
          }
        }
        if ('error' in result) {
          const { error } = result
          const reason = t(`reason.${error.reason}`, {
            path: 'path' in error ? error.path : '',
            file: 'file' in error ? error.file : '',
          })
          return { text: t('installFailed', { reason }) }
        }
        if ('already' in result) {
          return { text: t('alreadyHave', { id: result.already.meta.id, name: nameFor(result.already) }) }
        }
        characters = await loadCharacters($)
        const vars = { id: result.id, name: nameFor(result.character), wanted: result.wanted }
        return { text: t(result.renamed ? 'installedRenamed' : 'installed', vars) }
      }
      case 'export': {
        characters = await loadCharacters($)
        const ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        const out = await exportPack($, ch, command.withSource)
        return { text: out === null ? t('exportFailed') : t('exported', { path: out }) }
      }
      case 'share': {
        characters = await loadCharacters($)
        let ch = resolveCharacter(command.target, characters, lang())
        if (ch === null) return { text: t('unknownCharacter', { arg: command.target }) }
        const gh = await ghStatus($)
        if (gh !== 'ok') return { text: t(gh === 'missing' ? 'ghMissing' : 'ghLoggedOut') }
        if (command.as !== null && command.as !== ch.meta.id) {
          if (!isId(command.as)) return { text: t('asInvalid', { id: command.as }) }
          if (characters.some(other => other.meta.id === command.as)) return { text: t('asExists', { id: command.as }) }
          const wasCurrent = currentOf(current)?.meta.id === ch.meta.id
          const renamed = await renamePack($, ch, command.as)
          if (renamed === null) return { text: t('shareFailed', { reason: t('bundleFailed') }) }
          ch = renamed
          characters = await loadCharacters($)
          if (wasCurrent) {
            await saveSettings($, { ...current, character: ch.meta.id })
            $.ui.invalidate('ui.render')
          }
        }
        const id = ch.meta.id
        const taken = await takenByOther($, id)
        if (taken !== null) {
          const suggestion = suggestId(id, new Set([...Object.keys(taken), ...characters.map(other => other.meta.id)]))
          return { text: t('idTaken', { id, target: id, suggestion }) }
        }
        const bundle = await bundlePack($, ch)
        if (bundle === null) return { text: t('shareFailed', { reason: t('bundleFailed') }) }
        const body = shareBody({ id, name: nameFor(ch), description: ch.meta.description, bundle })
        const opened = await openIssue($, `share: ${id}`, body)
        if ('reason' in opened) return { text: t('shareFailed', { reason: opened.reason }) }
        return { text: t('shared', { name: nameFor(ch), id, issue: opened.url, page: petPage(id) }) }
      }
      case 'unshare': {
        // 내 컴퓨터에서 지운 펫도 내릴 수 있게: 캐릭터가 없으면 id 모양인지만 본다
        characters = await loadCharacters($)
        const id = resolveCharacter(command.target, characters, lang())?.meta.id ?? (isId(command.target) ? command.target : null)
        if (id === null) return { text: t('usage') }
        const gh = await ghStatus($)
        if (gh !== 'ok') return { text: t(gh === 'missing' ? 'ghMissing' : 'ghLoggedOut') }
        const opened = await openIssue($, `unshare: ${id}`, unshareBody(id))
        if ('reason' in opened) return { text: t('shareFailed', { reason: opened.reason }) }
        return { text: t('unshareRequested', { id, issue: opened.url }) }
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
        await syncStatus($, lang())
        return { text: changed(settings) }
      }
    }
  })

  // 승인 대기: 엔진이 직접 알림을 보낸다. 겹치지 않게 도찌는 말풍선만
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') {
      const settings = normalizeSettings(await read($, settingsAtom))
      lang = () => langOf(settings)
      await showAlert($, talk('permission'))
    }
    return next(e)
  })

  // 계기를 갱신하고, 컨텍스트가 90%를 넘으면 한 번 말한다.
  // 주간 한도: 80/85/90/95/99%를 넘을 때 한 번씩 (5시간 창은 무시)
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await refreshMeter($, e)
    const percent = e.context.percent
    if (e.changed.includes('context') && percent !== undefined) {
      const settings = normalizeSettings(await read($, settingsAtom))
      const { danger } = settings.gauge.context
      // 위험 기준보다 5 이상 내려가면(/compact) 다음에 다시 말한다
      if (percent < danger - 5) stuffedWarned = false
      if (percent >= danger && !stuffedWarned && settings.limit) {
        stuffedWarned = true
        lang = () => langOf(settings)
        await showAlert($, talk('stuffed', { percent: String(percent) }))
      }
    }
    // 진화 단계를 먼저 맞춰서 상태 줄의 별이 이번 측정을 따르게
    if (e.changed.includes('rateLimits')) {
      lastReading = readingOf(e.rateLimits)
      await refreshStage($, true, evolvedText, lastReading)
    }
    await syncStatus($, lang())
    if (!e.changed.includes('rateLimits')) return result
    // 측정이 겹쳐 와도(서브에이전트 여럿) 읽고-계산하고-쓰는 사이에 끼어들지 못하게 줄을 세운다
    const turn = measureLock.then(async () => {
      const settings = normalizeSettings(await read($, settingsAtom))
      if (!settings.limit) return
      lang = () => langOf(settings)
      const stored = await $.store.get('limitSeen')
      const seen = (typeof stored === 'object' && stored !== null ? stored : {}) as LimitSeen
      const { alert, seen: next2 } = limitAlert(e.rateLimits, seen, await $.clock.now())
      await $.store.set('limitSeen', next2)
      if (alert === null) return
      const text = limitText(alert)
      await showAlert($, text)
      await $.ui.notify(text, { title: nameFor(currentOf(settings)) }).catch(() => undefined)
    })
    measureLock = turn.catch(() => undefined)
    await turn
    return result
  })

  // 오래 쉬고 큰 대화를 이어가려 할 때: 입력을 시작하는 순간 한 번 말한다 (막지 않는다)
  on('prompt.edit', async ($, e, next) => {
    if (!restWarned && lastTurnAt !== null) {
      const settings = normalizeSettings(await read($, settingsAtom))
      const now = await $.clock.now()
      // 시간 조건을 먼저 본다: 타이핑마다 사용량을 묻지 않게
      if (shouldWarnRest(lastTurnAt, now, Number.MAX_SAFE_INTEGER, settings.rest)) {
        const used = (await $.session.usage().catch(() => null))?.context.tokens
        // 다시 연 직후에는 토큰 수를 아직 모를 수 있다: 알게 될 때까지 다음 타이핑에서 다시 본다
        if (used !== undefined) {
          restWarned = true
          if (shouldWarnRest(lastTurnAt, now, used, settings.rest)) {
            lang = () => langOf(settings)
            await showAlert($, talk('rest', { tokens: tokens(used) }))
          }
        }
      }
    }
    return next(e)
  })

  // 파일을 바꾸는 도구가 끝나면 git을 다시 읽고, Claude가 고친 파일을 기억한다.
  // 아티팩트를 올리거나 열면 목록에 넣는다
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    if (EDIT_TOOLS.has(e.tool)) {
      const input = e as { file_path?: unknown; notebook_path?: unknown }
      const path = typeof input.file_path === 'string' ? input.file_path : input.notebook_path
      if (typeof path === 'string') {
        const rel = repoRoot !== null && path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path
        await update($, touchedAtom, list => (list.includes(rel) ? list : [...list, rel]))
      }
    }
    if (EDIT_TOOLS.has(e.tool) || e.tool === 'Bash') void refreshGit($, lang()).catch(() => undefined)
    if (e.tool === 'Artifact') {
      const input = e as { action?: unknown; asset?: unknown; file_path?: unknown }
      const isPage = input.action === undefined || input.action === 'publish' || input.action === 'open'
      const link = isPage && input.asset !== true
        ? artifactOf(ran.result, ran.text, typeof input.file_path === 'string' ? input.file_path : undefined)
        : null
      if (link !== null) {
        const list = addArtifact(await read($, artifactsAtom), link)
        await update($, artifactsAtom, () => list)
        await $.store.set(`artifacts:${await $.session.id()}`, list)
        await syncStatus($, lang())
      }
    }
    return ran
  })

  // 메시지를 보내면 경고 말풍선은 할 일을 다 했다
  on('prompt.submit', async ($, e, next) => {
    await update($, alertAtom, () => null)
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    // 사람이 패널을 닫으면 입력창 위 띠로 돌아간다
    if (e.id === PANE) {
      await update($, paneAtom, () => false)
      await syncStatus($, lang())
    }
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
    lastTurnAt = await $.clock.now()
    restWarned = false
    void refreshGit($, lang()).catch(() => undefined)
    await $.store.set(`lastTurnAt:${await $.session.id()}`, lastTurnAt)
    timer?.cancel()
    timer = null
    await update($, tickAtom, () => 0)
    await update($, workingAtom, () => false)

    const result = await next(e)
    if (e.reason === 'answer') {
      const now = await $.clock.now()
      const normalizedCharacter = normalizeSettings(await read($, settingsAtom)).character
      const usd = (await $.session.usage().catch(() => null))?.cost?.usd
      const sessionId = await $.session.id()
      await growWith($, g => {
        // 달력 주가 넘어갔으면 먼저 넘긴다: 월요일 첫 답변은 새 주에
        const answered = recordAnswer(observe(g, { kind: 'none' }, now, normalizedCharacter).grow, now)
        return seen(usd === undefined ? answered : recordCost(answered, sessionId, usd, now), now).grow
      })
    }
    await refreshStage($, true, evolvedText)
    const settings = normalizeSettings(await read($, settingsAtom))
    lang = () => langOf(settings)
    await syncStatus($, lang())
    if (settings.notify && e.reason === 'answer' && e.durationMs >= settings.notifyAfterSec * 1000) {
      const text = talk('done', { duration: duration(lang(), e.durationMs) })
      const hint = hintedNoChannel ? null : talk('noChannel')
      lastNotify = await notifyDone($, nameFor(currentOf(settings)), text, hint)
      if (lastNotify?.isSent === false && lastNotify.reason === 'no-channel') hintedNoChannel = true
    }
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
    const alert = await activeAlert($)
    // 경고 말풍선은 '일할 때만' 모드에서 쉬는 중이어도 펫을 꺼내 보여준다
    if (hasSurvey || (settings.show === 'working' && !isWorking && alert === null)) return next(e)
    // 옆 패널이 떠 있으면 캐릭터가 두 번 나오지 않게 띠는 비운다
    if (settings.show === 'side' && (await read($, paneAtom))) return next(e)

    const tick = Number(await read($, tickAtom))
    const { Box, Text } = $.ui.resolve(e)
    const bubble = (
      <Box borderStyle="round" paddingX={1}>
        <Text>{alert ?? wordsFor(settings, isWorking, tick)}</Text>
      </Box>
    )
    const art = currentOf(settings)?.art ?? null
    const layout = bandLayout(maxRows, bodyColumns, e.surface, e.viewport?.isFullscreen ?? false)
    const { Button } = $.ui.resolve(e)
    const patButton = <Button key="pat" label="♥" hotkey="p" onPress={() => void pat($, patText())} />
    if (art === null || layout === 'text' || e.surface !== 'terminal') return bubble

    const { Raster } = $.ui.resolve(e)
    const stage = Number(await read($, stageAtom)) as Stage
    const dots = dotsFor(art, stage, isWorking, tick, layout)
    const petted = Number(await read($, pettedAtom)) > (await $.clock.now())

    // 만화 말풍선: 머리 오른쪽 위에 띄우고, 아래 꼬리가 캐릭터 쪽(왼쪽 아래)을 가리킨다
    return (
      <Box flexDirection="row" alignItems="flex-start">
        <Box flexDirection="column" alignItems="center">
          {petted ? <Text color="#ff7a9a">♥</Text> : null}
          <Raster key="dots" columns={dots.columns} rows={dots.rows} cells={dots.cells} />
        </Box>
        <Box flexDirection="column">
          {bubble}
          <Text>{' ╱'}</Text>
          <Text>{'╱'}</Text>
          {patButton}
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
    const alert = await activeAlert($)
    const bubble = (
      <Box borderStyle="round" paddingX={1}>
        <Text wrap="wrap">{alert ?? wordsFor(settings, isWorking, tick)}</Text>
      </Box>
    )
    // 펫 아래: 상태 카드(세션·주간), git 상태, 이 세션의 아티팩트. 펫이 작은 그림(12줄)으로 설 자리는 남긴다
    const { Link } = $.ui.resolve(e)
    const git = await read($, gitAtom)
    const artifacts = await read($, artifactsAtom)
    const touched = new Set(await read($, touchedAtom))
    const minute = Number(await read($, minuteAtom))
    const look = lookFor(settings.theme)
    const colors = look.colors
    const card = cardOf(settings.line === 'off' ? null : await read($, meterAtom), {
      elapsedMs: sessionBegan === null ? 0 : Math.max(0, minute * 60000 - sessionBegan),
      cost: settings.cost,
      lang: lang(),
      width: Math.max(4, Math.min(10, bodyColumns - 30)),
      gauge: settings.gauge,
      look,
    })
    const cardRows = card.rows.length + (card.foot === null ? 0 : 1)
    const infoRoom = Math.max(4, scroll.bodyRows - PET_MIN_ROWS)
    const restRoom = Math.max(2, infoRoom - (cardRows > 0 ? cardRows + 1 : 0))
    const artifactRows = Math.min(artifacts.length, Math.max(1, Math.floor(restRoom / 3)))
    const gitRoom = restRoom - (artifactRows > 0 ? artifactRows + 1 : 0) - 1
    const lines = git === null ? [] : gitLines(git, touched, bodyColumns, gitRoom, lang())
    // 얼굴은 괜찮을 때 강조색(테마가 'pet'이면 펫의 대표색), 세션이 차면 단계 색.
    // 앞 칸과 이름 칸은 가장 긴 것에 맞춰 막대를 세로로 맞춘다
    const accent = colors.accent === 'pet' ? accentOf(currentOf(settings)?.art ?? null) : colors.accent
    const leadCols = Math.max(0, ...card.rows.map(row => textCols(row.lead))) + 1
    const labelCols = Math.max(0, ...card.rows.map(row => textCols(row.label))) + 1
    const cardEls = [
      ...card.rows.map(row => (
        <Box key={`card-${row.kind}`} flexDirection="row">
          <Box width={leadCols}>
            <Text color={row.kind === 'context' && row.level === 'ok' ? accent : colors[row.level]}>{row.lead}</Text>
          </Box>
          <Box width={labelCols}>
            <Text color={colors.dim}>{row.label}</Text>
          </Box>
          <Text color={colors[row.level]}>{`${row.bar} ${row.percent}`}</Text>
          <Text color={colors.dim} wrap="truncate">
            {row.tail}
          </Text>
        </Box>
      )),
      ...(card.foot === null
        ? []
        : [
            <Text key="card-foot" color={colors.dim} wrap="truncate">
              {card.foot}
            </Text>,
          ]),
    ]
    const gitEls = lines.map((line, i) => (
      <Text key={`git-${i}`} wrap="truncate">
        {line}
      </Text>
    ))
    const artifactEls = artifacts.slice(0, artifactRows).map(item => (
      <Text key={item.url} wrap="truncate">
        {'🔗 '}
        <Link href={item.url} label={item.title} />
      </Text>
    ))
    const sections = [cardEls, gitEls, artifactEls].filter(els => els.length > 0)
    const info = (
      <Box key="info" flexDirection="column" width={bodyColumns}>
        {sections.flatMap((els, i) => (i === 0 ? els : [<Text key={`gap-${i}`}> </Text>, ...els]))}
      </Box>
    )
    const used = sections.reduce((n, els) => n + els.length, 0) + Math.max(0, sections.length - 1)
    const hasInfo = used > 0
    const petRows = scroll.bodyRows - (hasInfo ? used + 1 : 0)

    const art = currentOf(settings)?.art ?? null
    const layout = paneLayout(bodyColumns, petRows, e.surface)
    if (art === null || layout === 'text' || e.surface !== 'terminal') {
      return hasInfo ? (
        <Box flexDirection="column">
          {bubble}
          {info}
        </Box>
      ) : (
        bubble
      )
    }

    const { Raster, Button } = $.ui.resolve(e)
    const stage = Number(await read($, stageAtom)) as Stage
    const dots = dotsFor(art, stage, isWorking, tick, layout)
    const petted = Number(await read($, pettedAtom)) > (await $.clock.now())

    // 세로로 긴 패널: 말풍선이 머리 위에 뜨고 꼬리가 아래 캐릭터를 가리킨다.
    // 정보가 없으면 캐릭터는 바닥(입력창 쪽)에 서고, 있으면 그 아래에 git과 아티팩트
    return (
      <Box flexDirection="column" height={scroll.bodyRows}>
        <Box flexDirection="column" alignItems="center" justifyContent="flex-end" height={petRows}>
          {bubble}
          <Text>{'╲'}</Text>
          {petted ? <Text color="#ff7a9a">♥</Text> : null}
          <Raster key="dots" columns={dots.columns} rows={dots.rows} cells={dots.cells} />
          <Box flexDirection="row">
            <Text color={accent}>{`${stars(stage)} ${talk('stageLabel', { n: String(stage) })} `}</Text>
            <Button key="pat" label="♥" hotkey="p" onPress={() => void pat($, patText())} />
          </Box>
        </Box>
        {hasInfo ? <Text> </Text> : null}
        {hasInfo ? info : null}
      </Box>
    )
  })
}

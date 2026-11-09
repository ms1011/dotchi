import type { Gauge, GrowRule, Lang, LineMode, RestRule, Settings, ShowMode, Threshold } from '../types'
import { DEFAULT_GAUGE } from './meter'
import { DEFAULT_THEME_ID, isThemeId } from './theme'
import { isId, isLang } from './packs'

export const DEFAULT_SETTINGS: Settings = {
  character: 'squirrel',
  show: 'working',
  voice: false,
  lang: null,
  limit: true,
  notify: true,
  notifyAfterSec: 60,
  rest: { hours: 24, tokens: 100000 },
  line: 'full',
  cost: false,
  gauge: DEFAULT_GAUGE,
  theme: DEFAULT_THEME_ID,
  grow: { reset: true, budgetUsd: null },
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** 게이지 기준: 1~100 정수, 주의가 위험보다 낮다 */
const isThreshold = (value: unknown): value is Threshold => {
  if (typeof value !== 'object' || value === null) return false
  const { warn, danger } = value as Record<string, unknown>
  return isInt(warn, 1, 100) && isInt(danger, 1, 100) && warn < danger
}

/** 저장된 기준: 망가진 쪽만 기본값으로 */
const normalizeGauge = (value: unknown): Gauge => {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    context: isThreshold(raw.context) ? { warn: raw.context.warn, danger: raw.context.danger } : DEFAULT_GAUGE.context,
    week: isThreshold(raw.week) ? { warn: raw.week.warn, danger: raw.week.danger } : DEFAULT_GAUGE.week,
  }
}

/** 달러: 20, $20, 12.5. 0보다 크고 백만 이하 */
export const parseUsd = (raw: string): number | null => {
  const match = /^\$?(\d+(?:\.\d+)?)$/.exec(raw.trim())
  if (match === null) return null
  const value = Number(match[1])
  return isUsd(value) ? value : null
}
const isUsd = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1000000

/** 저장된 진화 설정: 망가진 칸만 기본값 */
const normalizeGrow = (value: unknown): GrowRule => {
  const raw = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    reset: typeof raw.reset === 'boolean' ? raw.reset : DEFAULT_SETTINGS.grow.reset,
    budgetUsd: isUsd(raw.budgetUsd) ? raw.budgetUsd : null,
  }
}

const isSeconds = (value: unknown): value is number => isInt(value, 5, 3600)

const isRest = (value: unknown): value is RestRule => {
  if (typeof value !== 'object' || value === null) return false
  const { hours, tokens } = value as Record<string, unknown>
  return isInt(hours, 1, 720) && isInt(tokens, 1000, Number.MAX_SAFE_INTEGER)
}

/** 토큰 수: 100k, 1.5m, 80000 */
export const parseTokens = (raw: string): number | null => {
  const match = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(raw.trim())
  if (match === null) return null
  const unit = match[2]!.toLowerCase()
  const value = Number(match[1]) * (unit === 'k' ? 1000 : unit === 'm' ? 1000000 : 1)
  return Number.isFinite(value) ? Math.round(value) : null
}

const isShow = (value: unknown): value is ShowMode => value === 'always' || value === 'working' || value === 'side'
const isLine = (value: unknown): value is LineMode => value === 'full' || value === 'mini' || value === 'off'

export const normalizeSettings = (raw: unknown): Settings => {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    character: isId(value.character) ? value.character : DEFAULT_SETTINGS.character,
    show: isShow(value.show) ? value.show : DEFAULT_SETTINGS.show,
    voice: typeof value.voice === 'boolean' ? value.voice : DEFAULT_SETTINGS.voice,
    lang: isLang(value.lang) ? value.lang : DEFAULT_SETTINGS.lang,
    limit: typeof value.limit === 'boolean' ? value.limit : DEFAULT_SETTINGS.limit,
    notify: typeof value.notify === 'boolean' ? value.notify : DEFAULT_SETTINGS.notify,
    notifyAfterSec: isSeconds(value.notifyAfterSec) ? value.notifyAfterSec : DEFAULT_SETTINGS.notifyAfterSec,
    rest: value.rest === null ? null : isRest(value.rest) ? { ...value.rest } : DEFAULT_SETTINGS.rest,
    line: isLine(value.line) ? value.line : DEFAULT_SETTINGS.line,
    cost: typeof value.cost === 'boolean' ? value.cost : DEFAULT_SETTINGS.cost,
    gauge: normalizeGauge(value.gauge),
    theme: isThemeId(value.theme) ? value.theme : DEFAULT_SETTINGS.theme,
    grow: normalizeGrow(value.grow),
  }
}

export type DotchiCommand =
  | { kind: 'status' }
  | { kind: 'list' }
  | { kind: 'switch'; target: string }
  | { kind: 'show'; mode: ShowMode }
  | { kind: 'voice'; on: boolean }
  | { kind: 'lang'; lang: Lang | null }
  | { kind: 'install'; path: string; raw: string }
  | { kind: 'export'; target: string; withSource: boolean }
  | { kind: 'remove'; target: string }
  | { kind: 'hatch'; image: string | null }
  | { kind: 'edit'; target: string }
  | { kind: 'share'; target: string; as: string | null }
  | { kind: 'unshare'; target: string }
  | { kind: 'limit'; on: boolean }
  | { kind: 'notify'; on: boolean }
  | { kind: 'notifyFix' }
  | { kind: 'notifyAfter'; seconds: number }
  | { kind: 'rest'; rest: RestRule | null }
  | { kind: 'line'; mode: LineMode }
  | { kind: 'lineCost'; on: boolean }
  | { kind: 'gauge'; target: keyof Gauge; at: Threshold }
  | { kind: 'themeList' }
  | { kind: 'themeSwitch'; target: string }
  | { kind: 'themeNew'; idea: string | null }
  | { kind: 'themeEdit'; target: string | null }
  | { kind: 'themeSet'; key: string; value: string }
  | { kind: 'themeInstall'; path: string; raw: string }
  | { kind: 'themeExport'; target: string }
  | { kind: 'themeShare'; target: string; as: string | null }
  | { kind: 'themeUnshare'; target: string }
  | { kind: 'themeRemove'; target: string }
  | { kind: 'grow' }
  | { kind: 'growReset'; on: boolean }
  | { kind: 'growBudget'; usd: number | null }
  | { kind: 'album' }
  | { kind: 'evolve'; target: string }
  | { kind: 'usage' }

/** 경로 인자: 감싼 따옴표를 벗기고 앞의 ~를 홈 폴더로 */
const toPath = (raw: string, home: string): string => {
  const quoted = /^(['"])(.*)\1$/.exec(raw)
  // 터미널에 파일을 끌어다 놓으면 공백 등이 역슬래시로 이스케이프된다 (따옴표로 감싼 경로는 그대로)
  const path = quoted ? quoted[2]! : raw.replace(/\\(.)/g, '$1')
  return path === '~' || path.startsWith('~/') ? `${home}${path.slice(1)}` : path
}

/** /dotchi theme … : 테마 고르기·만들기·고치기·설치·공유 */
const parseThemeCommand = (trimmed: string, rest: string[], home: string): DotchiCommand => {
  const [sub, ...args] = rest
  // 하위 명령 뒤 전체: 공백이 든 얼굴·경로·설명을 그대로 받으려고 (하위 명령은 theme 바로 다음 낱말)
  const after = (word: string) => {
    const at = trimmed.indexOf(word, 'theme'.length)
    return at < 0 ? '' : trimmed.slice(at + word.length).trim()
  }
  if (sub === undefined || (sub === 'list' && args.length === 0)) return { kind: 'themeList' }
  if (sub === 'new') return { kind: 'themeNew', idea: after('new') || null }
  if (sub === 'edit') return args.length <= 1 ? { kind: 'themeEdit', target: args[0] ?? null } : { kind: 'usage' }
  if (sub === 'set') {
    const key = args[0]
    const value = key === undefined ? '' : after('set').slice(key.length).trim()
    return key !== undefined && value !== '' ? { kind: 'themeSet', key, value } : { kind: 'usage' }
  }
  if (sub === 'install') {
    const raw = after('install')
    return raw === '' ? { kind: 'usage' } : { kind: 'themeInstall', path: toPath(raw, home), raw }
  }
  if (sub === 'export' || sub === 'unshare' || sub === 'remove') {
    if (args.length !== 1) return { kind: 'usage' }
    const kind = sub === 'export' ? 'themeExport' : sub === 'unshare' ? 'themeUnshare' : 'themeRemove'
    return { kind, target: args[0]! }
  }
  if (sub === 'share') {
    if (args.length === 1) return { kind: 'themeShare', target: args[0]!, as: null }
    return args.length === 3 && args[1] === '--as' ? { kind: 'themeShare', target: args[0]!, as: args[2]! } : { kind: 'usage' }
  }
  return args.length === 0 ? { kind: 'themeSwitch', target: sub } : { kind: 'usage' }
}

/** /dotchi 뒤의 글자를 하위 명령으로. home은 경로의 ~를 풀 때 쓴다 */
export const parseDotchi = (args: string, home = ''): DotchiCommand => {
  const trimmed = args.trim()
  const [first = '', ...rest] = trimmed.split(/\s+/).filter(Boolean)
  const second = rest[0]
  if (first === '') return { kind: 'status' }
  if (first === 'install') {
    // 경로에는 공백이 있을 수 있어서 하위 명령 뒤 전체를 경로로 본다
    const raw = trimmed.slice('install'.length).trim()
    return raw === '' ? { kind: 'usage' } : { kind: 'install', path: toPath(raw, home), raw }
  }
  if (first === 'hatch') {
    const raw = trimmed.slice('hatch'.length).trim()
    return { kind: 'hatch', image: raw === '' ? null : toPath(raw, home) }
  }
  if (first === 'edit') return rest.length === 1 ? { kind: 'edit', target: second! } : { kind: 'usage' }
  if (first === 'export') {
    const withSource = rest.length === 2 && rest[1] === '--with-source'
    return second !== undefined && (rest.length === 1 || withSource)
      ? { kind: 'export', target: second, withSource }
      : { kind: 'usage' }
  }
  if (first === 'share') {
    if (rest.length === 1) return { kind: 'share', target: second!, as: null }
    return rest.length === 3 && rest[1] === '--as' ? { kind: 'share', target: second!, as: rest[2]! } : { kind: 'usage' }
  }
  if (first === 'unshare') return rest.length === 1 ? { kind: 'unshare', target: second! } : { kind: 'usage' }
  if (first === 'remove') return rest.length === 1 ? { kind: 'remove', target: second! } : { kind: 'usage' }
  if (first === 'list') return rest.length === 0 ? { kind: 'list' } : { kind: 'usage' }
  if (first === 'show') return rest.length === 1 && isShow(second) ? { kind: 'show', mode: second } : { kind: 'usage' }
  if (first === 'voice') {
    return rest.length === 1 && (second === 'on' || second === 'off') ? { kind: 'voice', on: second === 'on' } : { kind: 'usage' }
  }
  if (first === 'limit') {
    return rest.length === 1 && (second === 'on' || second === 'off') ? { kind: 'limit', on: second === 'on' } : { kind: 'usage' }
  }
  if (first === 'notify') {
    if (rest.length === 1 && (second === 'on' || second === 'off')) return { kind: 'notify', on: second === 'on' }
    if (rest.length === 1 && second === 'fix') return { kind: 'notifyFix' }
    if (rest.length === 2 && second === 'after') {
      const seconds = /^\d+$/.test(rest[1]!) ? Number(rest[1]) : NaN
      return isSeconds(seconds) ? { kind: 'notifyAfter', seconds } : { kind: 'usage' }
    }
    return { kind: 'usage' }
  }
  if (first === 'rest') {
    if (rest.length === 1 && second === 'off') return { kind: 'rest', rest: null }
    if (rest.length !== 2) return { kind: 'usage' }
    const rule = { hours: /^\d+$/.test(second!) ? Number(second) : NaN, tokens: parseTokens(rest[1]!) }
    return isRest(rule) ? { kind: 'rest', rest: rule } : { kind: 'usage' }
  }
  if (first === 'theme') return parseThemeCommand(trimmed, rest, home)
  if (first === 'grow') {
    if (rest.length === 0) return { kind: 'grow' }
    if (rest.length === 2 && second === 'reset' && (rest[1] === 'on' || rest[1] === 'off')) return { kind: 'growReset', on: rest[1] === 'on' }
    if (rest.length === 2 && second === 'budget') {
      if (rest[1] === 'off') return { kind: 'growBudget', usd: null }
      const usd = parseUsd(rest[1]!)
      return usd === null ? { kind: 'usage' } : { kind: 'growBudget', usd }
    }
    return { kind: 'usage' }
  }
  if (first === 'album') return rest.length === 0 ? { kind: 'album' } : { kind: 'usage' }
  if (first === 'evolve') return rest.length === 1 ? { kind: 'evolve', target: second! } : { kind: 'usage' }
  if (first === 'line') {
    if (rest.length === 1 && isLine(second)) return { kind: 'line', mode: second }
    if (rest.length === 2 && second === 'cost' && (rest[1] === 'on' || rest[1] === 'off')) return { kind: 'lineCost', on: rest[1] === 'on' }
    if (second === 'context' || second === 'week') {
      if (rest.length === 2 && rest[1] === 'reset') return { kind: 'gauge', target: second, at: DEFAULT_GAUGE[second] }
      const [warn, danger] = rest.slice(1).map(n => (/^\d+$/.test(n) ? Number(n) : NaN))
      const at = { warn, danger }
      return rest.length === 3 && isThreshold(at) ? { kind: 'gauge', target: second, at } : { kind: 'usage' }
    }
    return { kind: 'usage' }
  }
  if (first === 'lang') {
    if (rest.length !== 1) return { kind: 'usage' }
    if (second === 'auto') return { kind: 'lang', lang: null }
    return isLang(second) ? { kind: 'lang', lang: second } : { kind: 'usage' }
  }
  return rest.length === 0 ? { kind: 'switch', target: first } : { kind: 'usage' }
}

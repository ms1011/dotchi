import type { Lang, Settings, ShowMode } from '../types'
import { isId, isLang } from './packs'

export const DEFAULT_SETTINGS: Settings = { character: 'squirrel', show: 'working', voice: false, lang: null }

const isShow = (value: unknown): value is ShowMode => value === 'always' || value === 'working' || value === 'side'

export const normalizeSettings = (raw: unknown): Settings => {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    character: isId(value.character) ? value.character : DEFAULT_SETTINGS.character,
    show: isShow(value.show) ? value.show : DEFAULT_SETTINGS.show,
    voice: typeof value.voice === 'boolean' ? value.voice : DEFAULT_SETTINGS.voice,
    lang: isLang(value.lang) ? value.lang : DEFAULT_SETTINGS.lang,
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
  | { kind: 'usage' }

/** 경로 인자: 감싼 따옴표를 벗기고 앞의 ~를 홈 폴더로 */
const toPath = (raw: string, home: string): string => {
  const quoted = /^(['"])(.*)\1$/.exec(raw)
  // 터미널에 파일을 끌어다 놓으면 공백 등이 역슬래시로 이스케이프된다 (따옴표로 감싼 경로는 그대로)
  const path = quoted ? quoted[2]! : raw.replace(/\\(.)/g, '$1')
  return path === '~' || path.startsWith('~/') ? `${home}${path.slice(1)}` : path
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
  if (first === 'lang') {
    if (rest.length !== 1) return { kind: 'usage' }
    if (second === 'auto') return { kind: 'lang', lang: null }
    return isLang(second) ? { kind: 'lang', lang: second } : { kind: 'usage' }
  }
  return rest.length === 0 ? { kind: 'switch', target: first } : { kind: 'usage' }
}

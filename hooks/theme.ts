import type { Lang, Level, Look, ThemeMeta } from '../types'

/**
 * 상태 줄 테마: 색, 얼굴, 하트·막대 글자, 기호. 캐릭터와 따로 고르고 따로 공유한다.
 * 펫 사이트(dotchi-packs)가 이 파일을 그대로 가져다 접수 검사에 쓴다:
 * node가 바로 읽을 수 있게 다른 파일을 런타임에 import하지 않는다 (타입만)
 */

const LANGS: readonly Lang[] = ['ko', 'en', 'ja', 'zh']
const ID_PATTERN = /^[a-z0-9-]{1,32}$/
/** /dotchi theme 의 하위 명령 이름은 테마 id로 못 쓴다 */
export const THEME_RESERVED: readonly string[] = ['list', 'new', 'edit', 'set', 'install', 'export', 'share', 'unshare', 'remove']
/** 사이트와 같은 글자 제한 */
export const THEME_LIMITS = { name: 40, description: 300 }

export const DEFAULT_THEME_ID = 'pastel'

/** 기본 모양: 파스텔. 강조색은 펫 그림에서 뽑은 대표색 */
export const DEFAULT_LOOK: Look = {
  colors: { ok: '#8fd9b6', warn: '#ffd86b', danger: '#ff8fa3', dim: '#9a9ab0', accent: 'pet' },
  faces: { ok: '', warn: '', danger: '' },
  hearts: ['♥', '♡'],
  bar: ['▰', '▱'],
  symbols: { week: '⚡', tired: '🥱', reset: '↻', time: '⏱' },
}

export const isThemeId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value) && !THEME_RESERVED.includes(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const COLOR = /^#[0-9a-fA-F]{6}$/
const len = (text: string) => [...text].length
/** 글자 하나 자리(하트·막대·기호): 1~4 코드 포인트, 공백·제어 문자 없이 */
const isGlyph = (value: unknown): value is string =>
  typeof value === 'string' && len(value) >= 1 && len(value) <= 4 && !/[\s\p{Cc}`]/u.test(value)
/** 얼굴: 1~12 코드 포인트. 안쪽 공백은 되고 줄바꿈·제어 문자·백틱은 안 된다 */
/** 얼굴: 12글자까지. 빈 값이면 얼굴 없음 (공백만 있는 것은 안 된다) */
const isFace = (value: unknown): value is string =>
  typeof value === 'string' && (value === '' || (value.trim() !== '' && len(value) <= 12 && !/[\p{Cc}`]/u.test(value)))

const LEVELS: readonly Level[] = ['ok', 'warn', 'danger']
const COLOR_KEYS = ['ok', 'warn', 'danger', 'dim', 'accent'] as const
const SYMBOL_KEYS = ['week', 'tired', 'reset', 'time'] as const

const parseName = (value: unknown): ThemeMeta['name'] | null => {
  if (typeof value === 'string') return value.trim() === '' || len(value) > THEME_LIMITS.name ? null : value
  if (!isRecord(value)) return null
  const names: Partial<Record<Lang, string>> = {}
  for (const lang of LANGS) {
    const name = value[lang]
    if (name === undefined) continue
    if (typeof name !== 'string' || name.trim() === '' || len(name) > THEME_LIMITS.name) return null
    names[lang] = name
  }
  return Object.keys(names).length === 0 ? null : names
}

/** 한 칸 묶음(colors·faces·symbols): 없으면 기본값, 있는 칸은 모두 맞아야 한다 */
const section = <K extends string>(
  value: unknown,
  keys: readonly K[],
  fallback: Record<K, string>,
  ok: (key: K, v: unknown) => string | null,
): Record<K, string> | null => {
  if (value === undefined) return { ...fallback }
  if (!isRecord(value)) return null
  const out = { ...fallback }
  for (const key of keys) {
    if (value[key] === undefined) continue
    const parsed = ok(key, value[key])
    if (parsed === null) return null
    out[key] = parsed
  }
  return out
}

const pair = (value: unknown, fallback: [string, string]): [string, string] | null => {
  if (value === undefined) return [...fallback]
  return Array.isArray(value) && value.length === 2 && isGlyph(value[0]) && isGlyph(value[1]) ? [value[0], value[1]] : null
}

const color = (key: string, v: unknown): string | null => {
  if (key === 'accent' && v === 'pet') return 'pet'
  return typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : null
}

/** theme.json을 검사해 메타와 모양으로. 적지 않은 칸은 기본 모양, 틀린 칸이 하나라도 있으면 null */
export const parseTheme = (text: string): { meta: ThemeMeta; look: Look } | null => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(raw) || raw.format !== 1 || !isThemeId(raw.id)) return null
  const name = parseName(raw.name)
  if (name === null) return null
  if (raw.author !== undefined && (typeof raw.author !== 'string' || len(raw.author) > THEME_LIMITS.name)) return null
  if (raw.description !== undefined && (typeof raw.description !== 'string' || len(raw.description) > THEME_LIMITS.description)) {
    return null
  }
  const colors = section(raw.colors, COLOR_KEYS, DEFAULT_LOOK.colors, color)
  const faces = section(raw.faces, LEVELS, DEFAULT_LOOK.faces, (_, v) => (isFace(v) ? v : null))
  const symbols = section(raw.symbols, SYMBOL_KEYS, DEFAULT_LOOK.symbols, (_, v) => (isGlyph(v) ? v : null))
  const hearts = pair(raw.hearts, DEFAULT_LOOK.hearts)
  const bar = pair(raw.bar, DEFAULT_LOOK.bar)
  if (colors === null || faces === null || symbols === null || hearts === null || bar === null) return null
  return {
    meta: {
      format: 1,
      id: raw.id,
      name,
      ...(typeof raw.author === 'string' ? { author: raw.author } : {}),
      ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    },
    look: { colors, faces, hearts, bar, symbols },
  }
}

/** 이름: 지금 언어 → 영어 → 처음 나오는 언어 → id */
export const themeNameOf = (meta: ThemeMeta, lang: Lang): string => {
  const names = meta.name
  if (typeof names === 'string') return names
  return names[lang] ?? names.en ?? LANGS.map(l => names[l]).find(v => v !== undefined) ?? meta.id
}

/** /dotchi theme set 으로 바꿀 수 있는 칸 */
export const THEME_KEYS: readonly string[] = [
  ...COLOR_KEYS.map(k => `color.${k}`),
  ...LEVELS.map(k => `face.${k}`),
  'hearts',
  'bar',
  ...SYMBOL_KEYS.map(k => `symbol.${k}`),
]

/**
 * theme.json 객체의 한 칸을 바꾼 새 객체. 바꾼 결과가 테마 규칙에 맞아야 한다.
 * hearts·bar는 '찬 빈'처럼 공백으로 나눈 두 글자
 */
export const setThemeKey = (
  raw: Record<string, unknown>,
  key: string,
  value: string,
): Record<string, unknown> | { error: 'key' | 'value' } => {
  if (!THEME_KEYS.includes(key)) return { error: 'key' }
  const text = value.trim()
  const next: Record<string, unknown> = { ...raw }
  const [group, field] = key.split('.') as [string, string | undefined]
  if (field === undefined) {
    next[group] = text.split(/\s+/)
  } else {
    const name = group === 'color' ? 'colors' : group === 'face' ? 'faces' : 'symbols'
    // 색은 파일에도 소문자로 남긴다
    next[name] = { ...(isRecord(raw[name]) ? raw[name] : {}), [field]: group === 'color' ? text.toLowerCase() : text }
  }
  return parseTheme(JSON.stringify(next)) === null ? { error: 'value' } : next
}

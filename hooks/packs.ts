import type { Lang, LineSet, PackLines, PackMeta } from '../types'

export const LANGS: readonly Lang[] = ['ko', 'en', 'ja', 'zh']
export const ID_PATTERN = /^[a-z0-9-]{1,32}$/
/** 하위 명령 이름은 캐릭터 id로 못 쓴다 */
export const RESERVED: readonly string[] = ['list', 'hatch', 'edit', 'install', 'export', 'remove', 'show', 'voice', 'lang', 'share', 'unshare']

export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang)
export const isId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value) && !RESERVED.includes(value)

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const parseName = (value: unknown): PackMeta['name'] | null => {
  if (typeof value === 'string') return value.trim() === '' ? null : value
  if (!isRecord(value)) return null
  const names: Partial<Record<Lang, string>> = {}
  for (const lang of LANGS) {
    const name = value[lang]
    if (typeof name === 'string' && name.trim() !== '') names[lang] = name
  }
  return Object.keys(names).length === 0 ? null : names
}

export const parseMeta = (text: string): PackMeta | null => {
  const raw = parseJson(text)
  if (!isRecord(raw) || raw.format !== 1 || !isId(raw.id)) return null
  const name = parseName(raw.name)
  if (name === null) return null
  const frameMs = raw.frameMs
  if (frameMs !== undefined && (typeof frameMs !== 'number' || frameMs < 60 || frameMs > 1000)) return null
  return {
    format: 1,
    id: raw.id,
    name,
    ...(typeof raw.author === 'string' ? { author: raw.author } : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(typeof frameMs === 'number' ? { frameMs } : {}),
  }
}

const parseList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? value.filter(item => item.trim() !== '') : null

const parseSet = (value: unknown): LineSet | null => {
  if (!isRecord(value)) return null
  const spinner = parseList(value.spinner)
  const idle = parseList(value.idle)
  const ending = parseList(value.ending)
  return spinner === null || idle === null || ending === null ? null : { spinner, idle, ending }
}

/** 언어별 대사. 아는 언어가 하나도 없거나 아는 언어의 모양이 틀리면 null */
export const parseLines = (text: string): PackLines | null => {
  const raw = parseJson(text)
  if (!isRecord(raw)) return null
  const lines: PackLines = {}
  for (const lang of LANGS) {
    if (!(lang in raw)) continue
    const set = parseSet(raw[lang])
    if (set === null) return null
    lines[lang] = set
  }
  return Object.keys(lines).length === 0 ? null : lines
}

/** 고르는 순서: 지금 언어 → 영어 → 처음 나오는 언어 */
const pick = <T>(byLang: Partial<Record<Lang, T>>, lang: Lang): T | undefined =>
  byLang[lang] ?? byLang.en ?? LANGS.map(l => byLang[l]).find(v => v !== undefined)

export const nameOf = (meta: PackMeta, lang: Lang): string =>
  typeof meta.name === 'string' ? meta.name : pick(meta.name, lang) ?? meta.id

export const pickLines = (lines: PackLines, lang: Lang): LineSet => pick(lines, lang) ?? { spinner: [], idle: [], ending: [] }

/** 애니메이션 한 컷의 길이(ms). 팩에 없으면 250 */
export const frameMsOf = (meta: PackMeta): number => meta.frameMs ?? 250

/** 문구는 컷 속도와 상관없이 3초마다 바뀐다 */
export const ticksPerLine = (frameMs: number): number => Math.max(1, Math.round(3000 / frameMs))

/** 압축을 푼 폴더 안에서 팩 루트 찾기: dotchi.json이 있는 가장 얕은 폴더. __MACOSX·숨김은 무시, 후보가 여럿이면 null */
export const findPackRoot = (entries: readonly { path: string; isDir: boolean }[]): string | null => {
  const roots = entries
    .filter(e => !e.isDir)
    .map(e => e.path.split('/'))
    .filter(parts => parts[parts.length - 1] === 'dotchi.json')
    .filter(parts => !parts.some(p => p === '__MACOSX' || p.startsWith('.')))
    .map(parts => parts.slice(0, -1))
  if (roots.length === 0) return null
  const depth = Math.min(...roots.map(r => r.length))
  const shallowest = roots.filter(r => r.length === depth)
  return shallowest.length === 1 ? shallowest[0]!.join('/') : null
}

/** 겹치면 -2, -3 … 을 붙인다 */
export const uniqueId = (id: string, taken: ReadonlySet<string>): string => {
  if (!taken.has(id)) return id
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    // 번호를 붙여도 32자를 넘지 않게 앞부분을 줄인다
    const candidate = `${id.slice(0, 32 - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

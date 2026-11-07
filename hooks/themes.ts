import type { EngineInterface } from 'claude-code'

import type { Lang, Origin, Theme } from '../types'
import { dataDir } from './library'
import { uniqueId } from './packs'
import { SITE } from './share'
import { isThemeId, parseTheme, themeNameOf } from './theme'

/** 테마 파일 다루기: 기본 테마는 플러그인의 themes/, 내 테마는 ~/.claude/dotchi/themes/<id>/theme.json */

async function run($: EngineInterface, argv: readonly string[]): Promise<{ exitCode: number }> {
  return $.process.run(argv).catch(() => ({ exitCode: 1 }))
}

async function readText($: EngineInterface, path: string): Promise<string | null> {
  return $.fs
    .read(path)
    .then(String)
    .catch(() => null)
}

async function readFolder($: EngineInterface, folder: string, origin: Origin): Promise<Theme[]> {
  const entries = await $.fs.list(folder).catch(() => [])
  const themes = await Promise.all(
    entries
      .filter(entry => entry.kind === 'dir' && !entry.isLink)
      .map(async entry => {
        const dir = `${folder}/${entry.name}`
        const text = await readText($, `${dir}/theme.json`)
        const parsed = text === null ? null : parseTheme(text)
        // 폴더 이름과 id가 다르면 건너뛴다 (고칠 때 엉뚱한 파일을 덮지 않게)
        return parsed === null || parsed.meta.id !== entry.name ? null : { ...parsed, dir, origin }
      }),
  )
  return themes.filter((theme): theme is Theme => theme !== null)
}

/** 기본 테마와 내 테마. 같은 id면 내 것이 이긴다. 깨진 테마는 건너뛴다 */
export async function loadThemes($: EngineInterface): Promise<Theme[]> {
  const builtin = await readFolder($, `${$.plugin.root}/themes`, 'builtin')
  const user = await readFolder($, `${await dataDir($)}/themes`, 'user')
  const byId = new Map<string, Theme>()
  for (const theme of [...builtin, ...user]) byId.set(theme.meta.id, theme)
  return [...byId.values()]
}

/** id(대소문자 무시) 또는 어느 언어 이름으로든 */
export const resolveTheme = (arg: string, themes: readonly Theme[]): Theme | null => {
  const lower = arg.trim().toLowerCase()
  const langs: Lang[] = ['ko', 'en', 'ja', 'zh']
  return (
    themes.find(theme => theme.meta.id === lower) ??
    themes.find(theme => langs.some(lang => themeNameOf(theme.meta, lang).toLowerCase() === lower)) ??
    null
  )
}

/** 테마를 내 폴더에 쓴다 (id는 json 안의 것). 쓴 뒤 다시 읽어 확인 */
export async function writeTheme($: EngineInterface, json: Record<string, unknown>): Promise<Theme | null> {
  const id = json.id
  if (!isThemeId(id)) return null
  const dir = `${await dataDir($)}/themes/${id}`
  if ((await run($, ['mkdir', '-p', dir])).exitCode !== 0) return null
  await $.fs.write(`${dir}/theme.json`, `${JSON.stringify(json, null, 2)}\n`)
  const text = await readText($, `${dir}/theme.json`)
  const parsed = text === null ? null : parseTheme(text)
  return parsed === null ? null : { ...parsed, dir, origin: 'user' }
}

/** theme.json 원문 (고칠 때 적지 않은 칸을 기본값으로 채워 넣지 않으려고 파싱 전 객체로) */
export async function readThemeJson($: EngineInterface, theme: Theme): Promise<Record<string, unknown> | null> {
  const text = await readText($, `${theme.dir}/theme.json`)
  if (text === null) return null
  try {
    const raw = JSON.parse(text) as unknown
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export type ThemeInstall = { theme: Theme; renamed: boolean; wanted: string } | { already: Theme } | { error: 'notFound' | 'badTheme' }

/**
 * theme.json 글을 내 테마로 설치. 같은 id에 같은 모양이 이미 있으면 already, id만 겹치면 -2처럼 번호를 붙인다
 */
export async function installThemeText($: EngineInterface, text: string, existing: readonly Theme[]): Promise<ThemeInstall> {
  const parsed = parseTheme(text)
  if (parsed === null) return { error: 'badTheme' }
  const same = (theme: Theme) => JSON.stringify([theme.meta.name, theme.look]) === JSON.stringify([parsed.meta.name, parsed.look])
  const twin = existing.find(theme => theme.meta.id === parsed.meta.id && same(theme))
  if (twin !== undefined) return { already: twin }
  const leftovers = (await $.fs.list(`${await dataDir($)}/themes`).catch(() => [])).map(entry => entry.name)
  const id = uniqueId(parsed.meta.id, new Set([...existing.map(theme => theme.meta.id), ...leftovers]))
  const raw = JSON.parse(text) as Record<string, unknown>
  const theme = await writeTheme($, { ...raw, id })
  return theme === null ? { error: 'badTheme' } : { theme, renamed: id !== parsed.meta.id, wanted: parsed.meta.id }
}

/** 파일(theme.json, <id>.theme.json) 또는 theme.json이 든 폴더에서 설치 */
export async function installThemePath($: EngineInterface, path: string, existing: readonly Theme[]): Promise<ThemeInstall> {
  const text = (await readText($, path.toLowerCase().endsWith('.json') ? path : `${path.replace(/\/+$/, '')}/theme.json`)) ?? null
  return text === null ? { error: 'notFound' } : installThemeText($, text, existing)
}

/** 사이트의 테마 글. 없으면 notOnSite, 연결이 안 되면 unreachable */
export async function fetchRemoteTheme($: EngineInterface, id: string): Promise<{ text: string } | { error: 'notOnSite' | 'unreachable' }> {
  const response = await $.http.fetch(`${SITE}/themes/${id}/theme.json`).catch(() => null)
  if (response === null || response.status >= 500) return { error: 'unreachable' }
  if (!response.ok) return { error: 'notOnSite' }
  return { text: response.text }
}

/** <작업 폴더>/<id>.theme.json 으로 내보낸다 */
export async function exportTheme($: EngineInterface, theme: Theme): Promise<string | null> {
  const json = await readThemeJson($, theme)
  if (json === null) return null
  const out = `${await $.session.cwd()}/${theme.meta.id}.theme.json`
  await $.fs.write(out, `${JSON.stringify(json, null, 2)}\n`)
  return out
}

export async function removeTheme($: EngineInterface, theme: Theme): Promise<void> {
  await run($, ['rm', '-rf', theme.dir])
}

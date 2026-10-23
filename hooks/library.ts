import type { EngineInterface } from 'claude-code'

import type { Character, Lang, Origin, PackMeta } from '../types'
import { parseArt } from './dots'
import { findPackRoot, LANGS, parseLines, parseMeta, uniqueId } from './packs'
import { SITE } from './share'

/** 사용자 데이터 폴더: 플러그인을 업데이트해도 남는다 */
export async function dataDir($: EngineInterface): Promise<string> {
  const home = (await $.env.get('HOME')) ?? ''
  return `${home}/.claude/dotchi`
}

async function readPack($: EngineInterface, dir: string, origin: Origin): Promise<Character | null> {
  const read = (name: string) =>
    $.fs
      .read(`${dir}/${name}`)
      .then(String)
      .catch(() => null)
  const [metaText, artText, linesText] = await Promise.all([read('dotchi.json'), read('art.json'), read('lines.json')])
  if (metaText === null || artText === null || linesText === null) return null
  const meta = parseMeta(metaText)
  const art = parseArt(artText)
  const lines = parseLines(linesText)
  if (meta === null || art === null || lines === null) return null
  return { meta, art, lines, dir, origin }
}

async function readFolder($: EngineInterface, folder: string, origin: Origin): Promise<Character[]> {
  const entries = await $.fs.list(folder).catch(() => [])
  const packs = await Promise.all(
    entries.filter(entry => entry.kind === 'dir').map(entry => readPack($, `${folder}/${entry.name}`, origin)),
  )
  return packs.filter((pack): pack is Character => pack !== null)
}

/** 기본 팩(플러그인 폴더)과 사용자 팩(데이터 폴더). 같은 id면 사용자 것이 이긴다. 깨진 팩은 건너뛴다 */
export async function loadCharacters($: EngineInterface): Promise<Character[]> {
  const builtin = await readFolder($, `${$.plugin.root}/characters`, 'builtin')
  const user = await readFolder($, `${await dataDir($)}/characters`, 'user')
  const byId = new Map<string, Character>()
  for (const ch of [...builtin, ...user]) byId.set(ch.meta.id, ch)
  return [...byId.values()]
}

/** id(대소문자 무시) 또는 어느 언어 이름으로든 캐릭터 찾기 */
export const resolveCharacter = (arg: string, chars: readonly Character[], _lang: Lang): Character | null => {
  const lower = arg.trim().toLowerCase()
  const names = (ch: Character) =>
    typeof ch.meta.name === 'string' ? [ch.meta.name] : LANGS.map(l => (ch.meta.name as Record<string, string>)[l])
  return (
    chars.find(ch => ch.meta.id === lower) ??
    chars.find(ch => names(ch).some(n => n !== undefined && n.toLowerCase() === lower)) ??
    null
  )
}

export type InstallResult = { id: string; character: Character; renamed: boolean } | { error: InstallError }
export type InstallError = { reason: 'notFound'; path: string } | { reason: 'noPack' } | { reason: 'badPack'; file: string } | { reason: 'unzip' }

type Entry = { path: string; isDir: boolean; isLink: boolean }

/** 폴더 안 파일·폴더를 상대 경로로 (깊이 4까지). 링크 안으로는 들어가지 않고, 숨김·__MACOSX는 건너뛴다 */
async function walk($: EngineInterface, root: string, prefix = '', depth = 0): Promise<Entry[]> {
  if (depth > 4) return []
  const entries = await $.fs.list(prefix === '' ? root : `${root}/${prefix}`).catch(() => [])
  const out: Entry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === '__MACOSX') continue
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    out.push({ path, isDir: entry.kind === 'dir', isLink: entry.isLink })
    if (entry.kind === 'dir' && !entry.isLink) out.push(...(await walk($, root, path, depth + 1)))
  }
  return out
}

const PICTURE = /\.(png|webp|jpe?g)$/i
/** 팩으로 옮기는 파일: 세 JSON, grid/*.txt, (원하면) source/의 그림. 링크와 그 밖의 파일은 옮기지 않는다 */
const isPackFile = (entry: Entry, withSource: boolean) =>
  !entry.isDir &&
  !entry.isLink &&
  (['dotchi.json', 'art.json', 'lines.json'].includes(entry.path) ||
    /^grid\/[^/]+\.txt$/.test(entry.path) ||
    (withSource && /^source\/[^/]+$/.test(entry.path) && PICTURE.test(entry.path)))

/** 팩 파일만 하나씩 복사 (링크를 따라가 엉뚱한 파일이 섞이지 않게) */
async function copyPackFiles($: EngineInterface, from: string, to: string, withSource: boolean): Promise<boolean> {
  const files = (await walk($, from)).filter(entry => isPackFile(entry, withSource))
  if (!files.some(f => f.path === 'dotchi.json')) return false
  for (const dir of new Set(['', ...files.map(f => f.path.split('/').slice(0, -1).join('/'))])) {
    if ((await run($, ['mkdir', '-p', dir === '' ? to : `${to}/${dir}`])).exitCode !== 0) return false
  }
  for (const file of files) {
    if ((await run($, ['cp', `${from}/${file.path}`, `${to}/${file.path}`])).exitCode !== 0) return false
  }
  return true
}

/** 팩 폴더의 세 파일을 검사: 깨진 파일 이름을 돌려준다 */
async function checkPack($: EngineInterface, dir: string): Promise<{ meta: PackMeta } | { file: string }> {
  const read = (name: string) =>
    $.fs
      .read(`${dir}/${name}`)
      .then(String)
      .catch(() => '')
  const meta = parseMeta(await read('dotchi.json'))
  if (meta === null) return { file: 'dotchi.json' }
  if (parseArt(await read('art.json')) === null) return { file: 'art.json' }
  if (parseLines(await read('lines.json')) === null) return { file: 'lines.json' }
  return { meta }
}

/** 명령 실행: 시작조차 못 하면 실패(exitCode 1)로 */
async function run($: EngineInterface, argv: readonly string[]): Promise<{ exitCode: number }> {
  return $.process.run(argv).catch(() => ({ exitCode: 1 }))
}

/** zip 또는 폴더의 팩을 사용자 데이터 폴더에 설치. 실패하면 아무것도 남기지 않는다 */
export async function installPack($: EngineInterface, path: string, taken: ReadonlySet<string>): Promise<InstallResult> {
  if (!(await $.fs.exists(path).catch(() => false))) return { error: { reason: 'notFound', path } }
  const data = await dataDir($)
  const isZip = path.toLowerCase().endsWith('.zip')
  const tmp = `${data}/tmp/install-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  try {
    let source = path
    if (isZip) {
      const unzip = await run($, ['python3', '-m', 'zipfile', '-e', path, tmp])
      if (unzip.exitCode !== 0) return { error: { reason: 'unzip' } }
      source = tmp
    }
    const root = findPackRoot(await walk($, source))
    if (root === null) return { error: { reason: 'noPack' } }
    const dir = root === '' ? source : `${source}/${root}`
    const checked = await checkPack($, dir)
    if ('file' in checked) return { error: { reason: 'badPack', file: checked.file } }

    // 읽히지 않는 폴더가 남아 있어도 그 이름은 피한다 (그 안에 겹쳐 복사하지 않게)
    const leftovers = (await $.fs.list(`${data}/characters`).catch(() => [])).map(entry => entry.name)
    const id = uniqueId(checked.meta.id, new Set([...taken, ...leftovers]))
    const dest = `${data}/characters/${id}`
    const fail = async (error: InstallError): Promise<InstallResult> => {
      await run($, ['rm', '-rf', dest])
      return { error }
    }
    if (!(await copyPackFiles($, dir, dest, true))) return fail({ reason: 'badPack', file: dir })
    if (id !== checked.meta.id) {
      await $.fs.write(`${dest}/dotchi.json`, `${JSON.stringify({ ...checked.meta, id }, null, 2)}\n`)
    }
    const installed = await readPack($, dest, 'user')
    return installed === null
      ? fail({ reason: 'badPack', file: 'dotchi.json' })
      : { id, character: installed, renamed: id !== checked.meta.id }
  } finally {
    if (isZip) await run($, ['rm', '-rf', tmp])
  }
}

export type RemotePack = { dir: string; tmp: string } | { error: 'notOnSite' | 'unreachable' }

/**
 * 사이트에서 펫의 세 JSON을 받아 임시 폴더에 쓴다. 지울 폴더(tmp)는 부른 쪽이 지운다.
 * 하나라도 없으면 notOnSite, 연결이 안 되거나 서버 오류면 unreachable
 */
export async function fetchRemotePack($: EngineInterface, id: string): Promise<RemotePack> {
  const tmp = `${await dataDir($)}/tmp/remote-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const dir = `${tmp}/${id}`
  const texts: [string, string][] = []
  for (const name of ['dotchi.json', 'art.json', 'lines.json']) {
    const response = await $.http.fetch(`${SITE}/packs/${id}/${name}`).catch(() => null)
    if (response === null || response.status >= 500) return { error: 'unreachable' }
    if (!response.ok) return { error: 'notOnSite' }
    texts.push([name, response.text])
  }
  if ((await run($, ['mkdir', '-p', dir])).exitCode !== 0) return { error: 'unreachable' }
  for (const [name, text] of texts) await $.fs.write(`${dir}/${name}`, text)
  return { dir, tmp }
}

/** 팩을 <작업 폴더>/<id>.dotchi.zip으로. 원본 그림(source/)은 withSource일 때만 넣는다 */
export async function exportPack($: EngineInterface, ch: Character, withSource: boolean): Promise<string | null> {
  const data = await dataDir($)
  const cwd = await $.session.cwd()
  const out = `${cwd}/${ch.meta.id}.dotchi.zip`
  const tmp = `${data}/tmp/export-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const staged = `${tmp}/${ch.meta.id}`
  try {
    if (!(await copyPackFiles($, ch.dir, staged, withSource))) return null
    const zip = await run($, ['python3', '-m', 'zipfile', '-c', out, staged])
    return zip.exitCode === 0 ? out : null
  } finally {
    await run($, ['rm', '-rf', tmp])
  }
}

/** 사용자 팩 지우기 */
export async function removePack($: EngineInterface, ch: Character): Promise<void> {
  await run($, ['rm', '-rf', ch.dir])
}

/** 기본 팩을 고치기 전에 사용자 데이터 폴더로 복사한다 (플러그인 폴더는 업데이트 때 바뀐다) */
export async function copyToUser($: EngineInterface, ch: Character): Promise<string> {
  const dest = `${await dataDir($)}/characters/${ch.meta.id}`
  if (ch.dir === dest) return dest
  await run($, ['rm', '-rf', dest])   // 읽히지 않는 예전 복사본이 남아 있으면 지운다
  await copyPackFiles($, ch.dir, dest, true)
  return dest
}

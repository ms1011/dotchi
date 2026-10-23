import { mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { CommandRunInput, On } from 'claude-code'

import type { Frame, LineSet, PackLines } from '../types'

export const HOME = '/home/test'
export const DATA = `${HOME}/.claude/dotchi`

/**
 * 테스트용 파일 시스템 키:
 * - 'characters/<id>/…', 'tools/…' : 플러그인 폴더 안 (경로 끝이 같으면 맞음)
 * - 'data/…'                       : 사용자 데이터 폴더(~/.claude/dotchi) 안
 */
export type Files = Record<string, string>

const toKey = (files: Files, path: string): string | undefined => {
  if (path.startsWith(DATA)) return `data${path.slice(DATA.length)}`
  return Object.keys(files).find(k => !k.startsWith('data/') && (path === k || path.endsWith(`/${k}`)))
}

const dirKey = (files: Files, path: string): string | undefined => {
  const trimmed = path.replace(/\/+$/, '')
  if (trimmed.startsWith(DATA)) return `data${trimmed.slice(DATA.length)}`
  const dirs = new Set<string>()
  for (const k of Object.keys(files)) {
    if (k.startsWith('data/')) continue
    const parts = k.split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  return [...dirs].find(d => trimmed === d || trimmed.endsWith(`/${d}`))
}

export const fill = (color: string): Frame => Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => color))

export const artJson = (idle = fill('aaaaaa'), work = [fill('111111'), fill('222222'), fill('333333')]) =>
  JSON.stringify({ width: 32, height: 32, idle, work })

export const lineSet = (prefix: string): LineSet => ({
  spinner: [`${prefix}일1`, `${prefix}일2`],
  idle: [`${prefix}쉼1`, `${prefix}쉼2`],
  ending: [`${prefix}끝`],
})

/** 팩 하나의 세 파일. origin 'user'면 사용자 데이터 폴더에 */
export const packFiles = (
  id: string,
  options: {
    name?: string | Record<string, string>
    lines?: PackLines
    art?: string
    origin?: 'builtin' | 'user'
    frameMs?: number
  } = {},
): Files => {
  const base = options.origin === 'user' ? `data/characters/${id}` : `characters/${id}`
  return {
    [`${base}/dotchi.json`]: JSON.stringify({
      format: 1,
      id,
      name: options.name ?? id,
      ...(options.frameMs === undefined ? {} : { frameMs: options.frameMs }),
    }),
    [`${base}/art.json`]: options.art ?? artJson(),
    [`${base}/lines.json`]: JSON.stringify(options.lines ?? { ko: lineSet(id) }),
  }
}

/** 기본 팩 둘 (다람쥐·거북이) */
export const BUILTINS: Files = {
  ...packFiles('squirrel', { name: { ko: '다람쥐', en: 'Squirrel' }, lines: { ko: lineSet('다'), en: lineSet('sq') } }),
  ...packFiles('turtle', { name: { ko: '거북이', en: 'Turtle' }, lines: { ko: lineSet('거') } }),
}

/** 경로 → 파일 키 (폴더면 폴더 키). 데이터 폴더는 'data/…', 나머지는 키 끝이 맞는 것 */
const pathKey = (files: Files, path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  if (trimmed.startsWith(DATA)) return `data${trimmed.slice(DATA.length)}`
  return dirKey(files, trimmed) ?? toKey(files, trimmed) ?? trimmed.replace(/^\//, '')
}

/** cp -R, rm -rf, mkdir -p, python3 -m zipfile -e/-c 를 가짜 파일 시스템 위에서 흉내 낸다 */
const simulateShell = (files: Files, zips: Record<string, Files>, zipsOut: Record<string, string[]>) =>
  (argv: readonly string[]): { exitCode: number; stdout?: string; stderr?: string } => {
    const [cmd, ...args] = argv
    if (cmd === 'mkdir') return { exitCode: 0 }
    if (cmd === 'rm') {
      const target = pathKey(files, args[args.length - 1]!)
      for (const k of Object.keys(files)) if (k === target || k.startsWith(`${target}/`)) delete files[k]
      return { exitCode: 0 }
    }
    if (cmd === 'cp') {
      const [src, dest] = args.slice(-2) as [string, string]
      const from = pathKey(files, src)
      const to = pathKey(files, dest)
      const single = toKey(files, src)
      if (single !== undefined && files[single] !== undefined && !Object.keys(files).some(k => k.startsWith(`${single}/`))) {
        files[pathKey(files, dest)] = files[single]!
        return { exitCode: 0 }
      }
      const found = Object.keys(files).filter(k => k.startsWith(`${from}/`))
      if (found.length === 0) return { exitCode: 1, stderr: 'no such file' }
      for (const k of found) files[`${to}${k.slice(from.length)}`] = files[k]!
      return { exitCode: 0 }
    }
    if (cmd === 'python3' && args[0] === '-m' && args[1] === 'gzip') {
      // 흉내 gzip: 내용을 그대로 <파일>.gz에
      const key = pathKey(files, args[2]!)
      if (files[key] === undefined) return { exitCode: 1, stderr: 'no such file' }
      files[`${key}.gz`] = files[key]!
      return { exitCode: 0 }
    }
    if (cmd === 'python3' && args[0] === '-m' && args[1] === 'zipfile') {
      if (args[2] === '-e') {
        const content = zips[args[3]!]
        if (content === undefined) return { exitCode: 1, stderr: 'BadZipFile' }
        const to = pathKey(files, args[4]!)
        for (const [rel, text] of Object.entries(content)) files[`${to}/${rel}`] = text
        return { exitCode: 0 }
      }
      if (args[2] === '-c') {
        const from = pathKey(files, args[4]!)
        const base = from.split('/').pop()!
        zipsOut[args[3]!] = Object.keys(files)
          .filter(k => k.startsWith(`${from}/`))
          .map(k => `${base}${k.slice(from.length)}`)
        return { exitCode: 0 }
      }
    }
    return { exitCode: 127, stderr: `unknown command ${cmd}` }
  }

/** 테스트용 엔진 흉내: 명령 등록, 세션 시작, 저장소, 파일, 환경 변수, 토스트, 시계, 패널, 프로세스 */
export const fakeEngine = (
  on: On,
  options: {
    store?: Record<string, unknown>
    files?: Files
    placed?: boolean
    env?: Record<string, string>
    /** 명령 흉내를 바꾼다. undefined를 돌려주면 기본 흉내(cp, rm, zipfile…)로 */
    run?: (argv: readonly string[]) => { exitCode: number; stdout?: string; stderr?: string } | undefined
    /** 가짜 zip: zip 경로 → 그 안의 파일들(상대 경로) */
    zips?: Record<string, Files>
    /** 심볼릭 링크로 보일 파일 키 */
    links?: readonly string[]
    /** 가짜 인터넷: URL → 응답('offline'이면 연결 실패). 없는 URL은 404 */
    http?: Record<string, { status: number; text: string } | 'offline'>
  } = {},
) => {
  const files: Files = { ...(options.files ?? BUILTINS) }
  const toasts: string[] = []
  const reads: string[] = []
  const writes: { path: string; text: string }[] = []
  const runs: string[][] = []
  const fetched: string[] = []
  const stdins: (string | undefined)[] = []
  const opened: { id: string; columns?: number }[] = []
  const closed: string[] = []
  const stored: Record<string, unknown> = { ...options.store }
  const env: Record<string, string> = { HOME, LANG: 'ko_KR.UTF-8', ...options.env }
  const zipsOut: Record<string, string[]> = {}
  const shell = simulateShell(files, options.zips ?? {}, zipsOut)

  on('store.get', (_, e) => ({ value: stored[e.key] }))
  on('store.set', (_, e) => {
    stored[e.key] = e.value
    return { value: undefined }
  })
  on('env.get', (_, e) => ({ value: env[e.name] }))
  const clock = mock.clock(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.read', (_, e) => {
    reads.push(e.path)
    const key = toKey(files, e.path)
    const text = key === undefined ? undefined : files[key]
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: e.as === 'bytes' ? { base64: new TextEncoder().encode(text).toBase64() } : text }
  })
  on('fs.write', (_, e) => {
    writes.push({ path: e.path, text: e.text })
    const key = e.path.startsWith(DATA) ? `data${e.path.slice(DATA.length)}` : toKey(files, e.path) ?? e.path
    files[key] = e.text
    return { value: undefined }
  })
  on('fs.list', (_, e) => {
    const dir = dirKey(files, e.path)
    if (dir === undefined) throw new Error(`ENOENT: ${e.path}`)
    const children = new Map<string, 'file' | 'dir'>()
    for (const k of Object.keys(files)) {
      if (!k.startsWith(`${dir}/`)) continue
      const rest = k.slice(dir.length + 1).split('/')
      children.set(rest[0]!, rest.length > 1 ? 'dir' : 'file')
    }
    if (children.size === 0) throw new Error(`ENOENT: ${e.path}`)
    const links = new Set(options.links ?? [])
    return {
      value: [...children].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: links.has(`${dir}/${name}`) })),
    }
  })
  on('process.run', (_, e) => {
    runs.push([...e.argv])
    stdins.push(e.init?.stdin)
    const result = options.run?.(e.argv) ?? shell(e.argv)
    return {
      value: {
        exitCode: result.exitCode,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('fs.exists', (_, e) => {
    const key = pathKey(files, e.path)
    return { value: Object.keys(files).some(k => k === key || k.startsWith(`${key}/`)) }
  })
  on('http.fetch', (_, e) => {
    fetched.push(e.url)
    const answer = options.http?.[e.url] ?? { status: 404, text: 'Not Found' }
    if (answer === 'offline') throw new Error(`ENOTFOUND ${e.url}`)
    return { value: { status: answer.status, ok: answer.status >= 200 && answer.status < 300, headers: {}, text: answer.text } }
  })
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.toast', (_, e) => {
    toasts.push(JSON.stringify(e))
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    opened.push({ id: e.id, columns: e.columns })
    return { value: options.placed === false ? { isPlaced: false, reason: 'too narrow' } : { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    closed.push(e.id)
    return { value: undefined }
  })
  return { files, toasts, reads, writes, runs, stdins, fetched, clock, stored, opened, closed, env, zipsOut }
}

export const SESSION = { cwd: '/work', surface: 'terminal', isInteractive: true } as const

/** 테스트에서 명령 실행: 엔진이 채우는 origin은 빼고 부른다 */
export const runCommand = ($: Engine, command: string, args: string, columns = 200) =>
  $.command.run({ command, args, presentation: { isFullscreen: true, columns } } as CommandRunInput)

/** /dotchi 하위 명령 */
export const dotchi = ($: Engine, args: string, columns = 200) => runCommand($, 'dotchi', args, columns)

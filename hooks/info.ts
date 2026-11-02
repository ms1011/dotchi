import type { ArtifactLink, GitFile, GitState, Lang } from '../types'
import { orderFiles, shortPath } from './gitstat'
import { say } from './talk'

/** 브랜치 줄: ⎇ main ↑2 (앞선 커밋이 없거나 upstream이 없으면 수는 뺀다) */
export const branchLine = (git: GitState): string => `⎇ ${git.branch}${git.ahead ? ` ↑${git.ahead}` : ''}`

/** 바뀐 파일 한 줄: 상태, Claude가 고쳤으면 ✎, 줄인 경로 */
export const fileLine = (file: GitFile, touched: ReadonlySet<string>, width: number): string => {
  const mark = touched.has(file.path) ? '✎ ' : ''
  return `${file.code} ${mark}${shortPath(file.path, Math.max(8, width - 2 - mark.length))}`
}

/**
 * 패널의 git 영역 줄들. 줄 수(maxRows)를 넘으면 앞의 몇 개만 보여주고 '+n개 더'로 줄인다
 */
export const gitLines = (
  git: GitState,
  touched: ReadonlySet<string>,
  width: number,
  maxRows: number,
  lang: Lang,
): string[] => {
  const head = branchLine(git)
  if (git.files.length === 0) return [head, say(lang, 'clean')]
  const files = orderFiles(git.files, touched)
  const room = Math.max(1, maxRows - 1)
  if (files.length <= room) return [head, ...files.map(f => fileLine(f, touched, width))]
  const shown = files.slice(0, Math.max(0, room - 1))
  return [head, ...shown.map(f => fileLine(f, touched, width)), say(lang, 'more', { n: String(files.length - shown.length) })]
}

/** 상태 줄 한 줄 요약. 보여 줄 게 없으면 undefined */
export const summaryOf = (git: GitState | null, artifacts: readonly ArtifactLink[], lang: Lang): string | undefined => {
  const parts: string[] = []
  if (git !== null) {
    parts.push(branchLine(git))
    if (git.files.length > 0) parts.push(say(lang, 'files', { n: String(git.files.length) }))
  }
  if (artifacts.length > 0) parts.push(`🔗 ${artifacts[0]!.title}`)
  return parts.length === 0 ? undefined : parts.join(' · ')
}

/** 같은 주소는 하나만, 최근 것이 앞 */
export const addArtifact = (list: readonly ArtifactLink[], link: ArtifactLink): ArtifactLink[] => [
  link,
  ...list.filter(item => item.url !== link.url),
]

/** 저장된 목록 읽기: 모양이 이상한 것은 버린다 */
export const parseArtifacts = (raw: unknown): ArtifactLink[] =>
  Array.isArray(raw)
    ? raw.filter(
        (item): item is ArtifactLink =>
          typeof item === 'object' && item !== null && typeof item.url === 'string' && typeof item.title === 'string',
      )
    : []

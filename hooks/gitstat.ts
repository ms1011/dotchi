/** git status --porcelain=v2 --branch 를 패널에 그릴 모양으로 */

export type GitCode = 'M' | 'A' | 'D' | 'R' | '?'
export type GitFile = { code: GitCode; path: string }
export type GitState = {
  branch: string
  /** push하지 않은 커밋 수. upstream이 없으면 null */
  ahead: number | null
  files: GitFile[]
}

/** 바뀐 파일 한 줄의 상태 표시: XY 중 삭제·추가가 먼저 보이게 */
const codeOf = (xy: string): GitCode => (xy.includes('D') ? 'D' : xy.includes('A') ? 'A' : 'M')

/** core.quotePath=false로 읽어도 제어 문자가 든 경로는 따옴표로 감싸진다: 따옴표만 벗긴다 */
const unquote = (path: string): string => (/^".*"$/.test(path) ? path.slice(1, -1) : path)

export const parseStatus = (porcelain: string): GitState => {
  let branch = ''
  let ahead: number | null = null
  const files: GitFile[] = []
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.ab ')) ahead = Number(/\+(\d+)/.exec(line)?.[1] ?? 0)
    else if (line.startsWith('1 ')) {
      // 1 XY sub mH mI mW hH hI path
      const parts = line.split(' ')
      files.push({ code: codeOf(parts[1]!), path: unquote(parts.slice(8).join(' ')) })
    } else if (line.startsWith('2 ')) {
      // 2 XY sub mH mI mW hH hI Xscore path<TAB>origPath: 새 경로를 쓴다
      const rest = line.split(' ').slice(9).join(' ')
      files.push({ code: 'R', path: unquote(rest.split('\t')[0]!) })
    } else if (line.startsWith('u ')) {
      // u XY sub m1 m2 m3 mW h1 h2 h3 path (충돌)
      files.push({ code: 'M', path: unquote(line.split(' ').slice(10).join(' ')) })
    } else if (line.startsWith('? ')) {
      files.push({ code: '?', path: unquote(line.slice(2)) })
    }
  }
  return { branch, ahead, files }
}

/** 좁은 패널에 맞게: 파일 이름을 살리고 앞쪽 폴더를 …/ 로 줄인다 */
export const shortPath = (path: string, width: number): string => {
  if (path.length <= width) return path
  const parts = path.split('/')
  let tail = parts.pop()!
  if (tail.length + 2 > width) return `…${tail.slice(tail.length - (width - 1))}`
  while (parts.length > 0 && parts[parts.length - 1]!.length + tail.length + 3 <= width) tail = `${parts.pop()}/${tail}`
  return `…/${tail}`
}

/** Claude가 이 세션에서 고친 파일 먼저, 그다음 경로순 */
export const orderFiles = (files: readonly GitFile[], touched: ReadonlySet<string>): GitFile[] =>
  [...files].sort((a, b) => Number(touched.has(b.path)) - Number(touched.has(a.path)) || a.path.localeCompare(b.path))

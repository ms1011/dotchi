import { isId, uniqueId } from './packs'

/** 팩 공유 사이트(GitHub Pages)와 펫을 보관하는 저장소 */
export const SITE = 'https://ms1011.github.io/dotchi-packs'
export const PACKS_REPO = 'ms1011/dotchi-packs'

/** 사이트에서 펫 하나를 여는 주소 */
export const petPage = (id: string): string => `${SITE}/?pet=${id}`

/**
 * install 인자를 사이트의 펫 id로: 사이트 주소(?pet=<id> 또는 /packs/<id>/)면 거기서 꺼내고,
 * 주소가 아니면 id 모양일 때만. 다른 사이트 주소나 경로처럼 생긴 것은 null
 */
export const remoteIdOf = (raw: string): string | null => {
  const text = raw.trim()
  if (/^https?:\/\//i.test(text)) {
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return null
    }
    const site = new URL(SITE)
    if (url.origin !== site.origin || !`${url.pathname}/`.startsWith(`${site.pathname}/`)) return null
    const rest = url.pathname.slice(site.pathname.length)
    const fromPath = /^\/packs\/([^/]+)\/?$/.exec(rest)?.[1]
    const id = url.searchParams.get('pet') ?? fromPath ?? null
    return id !== null && isId(id) ? id : null
  }
  return isId(text) ? text : null
}

/** 묶음에 넣는 팩 파일: 세 JSON과 grid 격자. 사이트 접수도 같은 규칙으로 거른다 */
export const BUNDLE_FILE = /^(dotchi\.json|art\.json|lines\.json|grid\/[a-z0-9_-]{1,16}\.txt)$/
export type Bundle = { format: 1; files: Record<string, string> }

/** Issue 본문의 표식: 사이트 접수가 이것으로 올리기·내리기 요청을 알아본다 */
export const MARK_SHARE = '<!-- dotchi-share v1 -->'
export const MARK_UNSHARE = '<!-- dotchi-unshare v1 -->'
export const FENCE = 'dotchi-pack'

/** 사람이 읽는 줄: 줄바꿈은 공백으로, 백틱은 '로 (묶음 블록을 흉내 내지 못하게) */
const plain = (text: string) => text.replace(/[\r\n]+/g, ' ').replace(/`/g, "'").trim()

/** 올리기 Issue 본문: 표식, 이름과 소개, 접은 칸 안의 묶음(gzip한 Bundle JSON의 base64) */
export const shareBody = (input: { id: string; name: string; description: string | undefined; bundle: string }): string =>
  [
    MARK_SHARE,
    `**${plain(input.name)}** (\`${input.id}\`)`,
    ...(input.description === undefined || plain(input.description) === '' ? [] : [plain(input.description)]),
    `<details><summary>pack</summary>\n\n\`\`\`${FENCE}\n${input.bundle}\n\`\`\`\n</details>`,
  ].join('\n\n')

/** 내리기 Issue 본문 */
export const unshareBody = (id: string): string => `${MARK_UNSHARE}\n\nPlease take down \`${id}\`.`

/** 사이트 index.json의 taken(id → 주인의 GitHub 숫자 id). 모양이 틀리면 null */
export const takenOf = (indexJson: string): Record<string, number> | null => {
  try {
    const taken = (JSON.parse(indexJson) as { taken?: unknown }).taken
    if (typeof taken !== 'object' || taken === null || Array.isArray(taken)) return null
    return Object.fromEntries(Object.entries(taken).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
  } catch {
    return null
  }
}

/** 사이트와 내 컴퓨터 어디에도 없는 비슷한 id */
export const suggestId = (id: string, taken: ReadonlySet<string>): string => uniqueId(id, taken)

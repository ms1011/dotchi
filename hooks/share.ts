import { isId } from './packs'

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

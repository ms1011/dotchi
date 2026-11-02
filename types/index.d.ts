export type Lang = 'ko' | 'en' | 'ja' | 'zh'
export type ShowMode = 'always' | 'working' | 'side'
export type RestRule = { hours: number; tokens: number }
export type Settings = {
  character: string
  show: ShowMode
  voice: boolean
  lang: Lang | null
  /** 주간 한도 80/85/90/95/99% 경고 */
  limit: boolean
  /** 긴 작업이 끝나면 데스크톱 알림 */
  notify: boolean
  /** 이만큼(초) 걸린 턴만 알린다 */
  notifyAfterSec: number
  /** 오래 쉬고 큰 대화를 이어갈 때 경고. null이면 끔 */
  rest: RestRule | null
}
/** 행 우선 32×32. 각 칸은 'rrggbb' (#없음, 소문자) 또는 null(투명) */
export type Frame = (string | null)[][]
export type Art = { width: 32; height: 32; idle: Frame; work: Frame[] }
export type LineSet = { spinner: string[]; idle: string[]; ending: string[] }
export type PackLines = Partial<Record<Lang, LineSet>>
export type PackMeta = {
  format: 1
  id: string
  name: string | Partial<Record<Lang, string>>
  author?: string
  description?: string
  frameMs?: number
}
export type Origin = 'builtin' | 'user'
export type Character = { meta: PackMeta; art: Art; lines: PackLines; dir: string; origin: Origin }

declare module 'claude-code' {
  interface PluginState {
    dotchi: { settings: Settings; tick: number; working: boolean; paneShown: boolean }
  }
}

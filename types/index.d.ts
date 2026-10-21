export type Lang = 'ko' | 'en' | 'ja' | 'zh'
export type ShowMode = 'always' | 'working' | 'side'
export type Settings = { character: string; show: ShowMode; voice: boolean; lang: Lang | null }
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

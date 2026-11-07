import type { SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { ArtifactLink, Art, Gauge, GitState, Lang, Level, LineMode, Look, Meter, PackMeta, Threshold } from '../types'
import { branchLine } from './info'
import { forecast } from './limits'
import { say, UNITS, when } from './talk'
import { DEFAULT_LOOK } from './theme'

/**
 * 다마고치 계기판: 컨텍스트는 배부름(하트), 주간 한도는 ⚡.
 * 상태 줄은 글자만 받으므로 얼굴과 기호로 읽히게, 옆 패널은 파스텔 색까지
 */

export type { Level }

/** 펫 색을 뽑지 못할 때의 강조색: 라벤더 */
export const FALLBACK_ACCENT = '#b8a6ff'

/** 팩에 아이콘이 없을 때 */
export const DEFAULT_ICON = '🐾'

/**
 * 기본 기준. 컨텍스트: 70%부터 배부르고 90%부터 꽉 찼다.
 * 주간: 경고가 시작되는 80%부터 노랑, 95%부터 코랄. /dotchi line context|week 로 바꾼다
 */
export const DEFAULT_GAUGE: Gauge = { context: { warn: 70, danger: 90 }, week: { warn: 80, danger: 95 } }

const levelOf = (percent: number, at: Threshold): Level => (percent >= at.danger ? 'danger' : percent >= at.warn ? 'warn' : 'ok')
export const contextLevel = (percent: number, at: Threshold = DEFAULT_GAUGE.context): Level => levelOf(percent, at)
export const weekLevel = (percent: number, at: Threshold = DEFAULT_GAUGE.week): Level => levelOf(percent, at)

const filled = (percent: number, cells: number) => Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))

/** ♥♥♥♡♡ (테마의 [찬 칸, 빈 칸]) */
export const hearts = (percent: number, cells = 5, glyphs: readonly [string, string] = DEFAULT_LOOK.hearts): string => {
  const k = filled(percent, cells)
  return glyphs[0].repeat(k) + glyphs[1].repeat(cells - k)
}

/** ▰▰▰▱▱ */
export const bar = (percent: number, cells: number, glyphs: readonly [string, string] = DEFAULT_LOOK.bar): string => {
  const k = filled(percent, cells)
  return glyphs[0].repeat(k) + glyphs[1].repeat(cells - k)
}

/** claude-opus-5-5[1m] → Opus 5.5. 모르는 모양은 그대로 */
export const prettyModel = (raw: string): string => {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[^\]]*\])?$/.exec(raw.trim())
  if (match === null) return raw.trim()
  const family = match[1]!
  return `${family[0]!.toUpperCase()}${family.slice(1)} ${match[2]}${match[3] === undefined ? '' : `.${match[3]}`}`
}

/** 컨텍스트 창 크기: 1M, 200k */
export const windowLabel = (window: number): string =>
  window >= 1000000 ? `${Math.round(window / 100000) / 10}M` : `${Math.round(window / 1000)}k`

/** 세션을 켠 뒤 지난 시간. 1분이 안 되면 null */
export const elapsed = (lang: Lang, ms: number): string | null => {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return null
  const u = UNITS[lang]
  const [h, m] = [Math.floor(minutes / 60), minutes % 60]
  return h > 0 ? `${h}${u.h}${u.gap}${m}${u.m}` : `${m}${u.m}`
}

/** git diff --numstat: 더하고 뺀 줄 수. 바이너리(-)는 센다 할 수 없어 뺀다 */
export const parseNumstat = (out: string): { added: number; removed: number } => {
  let added = 0
  let removed = 0
  for (const line of out.split('\n')) {
    const [a, r] = line.split('\t')
    if (a === undefined || r === undefined || !/^\d+$/.test(a) || !/^\d+$/.test(r)) continue
    added += Number(a)
    removed += Number(r)
  }
  return { added, removed }
}

export type { Meter }

/** $.session.usage()나 session.measure의 값을 계기로 */
export const meterOf = (
  usage: { context: SessionContextUsage; rateLimits: readonly SessionRateLimit[]; cost?: SessionCost },
  model: string | null,
  now: number,
): Meter => {
  const seven = usage.rateLimits.find(w => w.kind === 'seven_day')
  const parsed = seven?.resetsAt === undefined ? NaN : Date.parse(seven.resetsAt)
  const resetsAt = Number.isFinite(parsed) ? parsed : null
  return {
    context: { percent: usage.context.percent ?? null, tokens: usage.context.tokens ?? null, window: usage.context.window },
    week:
      seven === undefined
        ? null
        : { percent: seven.percentUsed, resetsAt, emptyAt: forecast(seven.kind, seven.percentUsed, resetsAt, now) },
    costUsd: usage.cost?.usd ?? null,
    model: model === null || model.trim() === '' ? null : prettyModel(model),
  }
}

const money = (usd: number) => `$${usd.toFixed(2)}`

export type StatusInput = {
  meter: Meter | null
  git: GitState | null
  artifacts: readonly ArtifactLink[]
  icon: string
  mode: Exclude<LineMode, 'off'>
  cost: boolean
  elapsedMs: number
  lang: Lang
  /** 없으면 기본 기준 */
  gauge?: Gauge
  /** 없으면 기본 모양(파스텔) */
  look?: Look
}

/**
 * 상태 줄 한 줄: 🌰 ♥♥♥♡♡ 62% · ⚡ 41% · ⎇ main ↑2 · 파일 3개 +120 −8 · 12분 · 🔗 제목.
 * 0이거나 모르는 것은 뺀다. 보여 줄 게 없으면 undefined
 */
export const statusLine = (input: StatusInput): string | undefined => {
  const { meter, git, mode, lang } = input
  const gauge = input.gauge ?? DEFAULT_GAUGE
  const look = input.look ?? DEFAULT_LOOK
  const full = mode === 'full'
  const parts: string[] = []
  const percent = meter?.context.percent ?? null
  if (percent !== null && percent > 0) {
    if (full) {
      const level = contextLevel(percent, gauge.context)
      const mood = level === 'ok' ? '' : ` ${look.faces[level]}${level === 'danger' ? ' /compact' : ''}`
      parts.push(`${hearts(percent, 5, look.hearts)} ${percent}%${mood}`)
    } else {
      parts.push(`${percent}%`)
    }
  }
  const week = meter?.week ?? null
  if (week !== null) {
    parts.push(`${look.symbols.week} ${Math.floor(week.percent)}%${full && week.emptyAt !== null ? ` ${look.symbols.tired}` : ''}`)
  }
  if (git !== null) {
    parts.push(branchLine(git))
    if (full) {
      const diff = (git.added ?? 0) > 0 || (git.removed ?? 0) > 0 ? `+${git.added ?? 0} −${git.removed ?? 0}` : null
      const files = git.files.length > 0 ? say(lang, 'files', { n: String(git.files.length) }) : null
      const change = [files, diff].filter((p): p is string => p !== null).join(' ')
      if (change !== '') parts.push(change)
    }
  }
  if (full) {
    const time = elapsed(lang, input.elapsedMs)
    if (time !== null) parts.push(time)
    if (input.cost && meter?.costUsd != null && meter.costUsd >= 0.005) parts.push(money(meter.costUsd))
    const latest = input.artifacts[0]
    if (latest !== undefined) parts.push(`🔗 ${latest.title}`)
  }
  return parts.length === 0 ? undefined : `${input.icon} ${parts.join(' · ')}`
}

export type CardRow = { kind: 'context' | 'week'; lead: string; label: string; bar: string; percent: string; level: Level; tail: string }

/** 옆 패널의 상태 카드: 배부름·주간 막대 줄과, 시간·모델·창·비용 한 줄 */
export const cardOf = (
  meter: Meter | null,
  options: { elapsedMs: number; cost: boolean; lang: Lang; width: number; gauge?: Gauge; look?: Look },
): { rows: CardRow[]; foot: string | null } => {
  if (meter === null) return { rows: [], foot: null }
  const { lang, width } = options
  const gauge = options.gauge ?? DEFAULT_GAUGE
  const look = options.look ?? DEFAULT_LOOK
  const rows: CardRow[] = []
  const percent = meter.context.percent
  if (percent !== null) {
    const level = contextLevel(percent, gauge.context)
    rows.push({
      kind: 'context',
      lead: look.faces[level],
      label: say(lang, 'gaugeFull'),
      bar: bar(percent, width, look.bar),
      percent: `${percent}%`,
      level,
      tail: level === 'danger' ? ' /compact' : '',
    })
  }
  if (meter.week !== null) {
    const { percent: used, resetsAt, emptyAt } = meter.week
    rows.push({
      kind: 'week',
      lead: look.symbols.week,
      label: say(lang, 'gaugeWeek'),
      bar: bar(used, width, look.bar),
      percent: `${Math.floor(used)}%`,
      level: weekLevel(used, gauge.week),
      tail:
        emptyAt !== null
          ? ` ${look.symbols.tired} ${when(lang, emptyAt)}`
          : resetsAt !== null
            ? ` ${look.symbols.reset} ${when(lang, resetsAt)}`
            : '',
    })
  }
  const time = elapsed(lang, options.elapsedMs)
  const foot = [
    time === null ? null : `${look.symbols.time} ${time}`,
    meter.model,
    meter.context.window > 0 ? windowLabel(meter.context.window) : null,
    options.cost && meter.costUsd !== null && meter.costUsd >= 0.005 ? money(meter.costUsd) : null,
  ].filter((p): p is string => p !== null)
  return { rows, foot: foot.length === 0 ? null : foot.join(' · ') }
}

export const iconOf = (meta: PackMeta | null): string => meta?.icon ?? DEFAULT_ICON

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b
/** 어두운 터미널에서도 읽히는 최소 밝기 */
const MIN_LUMA = 150

/**
 * 펫의 대표색: 멈춘 그림에서 가장 많이 쓴 유채색을, 어두운 화면에서 읽히도록
 * 흰색 쪽으로 섞어 밝힌다. 무채색(검정 테두리, 흰색, 회색)뿐이면 라벤더
 */
export const accentOf = (art: Art | null): string => {
  if (art === null) return FALLBACK_ACCENT
  const counts = new Map<string, number>()
  for (const row of art.idle) {
    for (const cell of row) {
      if (cell === null) continue
      const [r, g, b] = [0, 2, 4].map(i => parseInt(cell.slice(i, i + 2), 16)) as [number, number, number]
      if (Math.max(r, g, b) - Math.min(r, g, b) < 30) continue
      counts.set(cell, (counts.get(cell) ?? 0) + 1)
    }
  }
  let best: string | null = null
  for (const [color, n] of counts) if (best === null || n > counts.get(best)!) best = color
  if (best === null) return FALLBACK_ACCENT
  const [r, g, b] = [0, 2, 4].map(i => parseInt(best.slice(i, i + 2), 16)) as [number, number, number]
  const base = luma(r, g, b)
  const t = base >= MIN_LUMA ? 0 : Math.min(1, Math.ceil(((MIN_LUMA - base) / (255 - base)) * 20) / 20)
  const mix = (c: number) => c + (255 - c) * t
  return `#${hex(mix(r))}${hex(mix(g))}${hex(mix(b))}`
}

/** 터미널 칸 수 어림: 한글·한자·가나·전각은 두 칸 (패널 카드의 이름 칸 너비) */
export const textCols = (text: string): number =>
  [...text].reduce((n, ch) => {
    if (/[\u200d\ufe0e\ufe0f\p{M}]/u.test(ch)) return n
    return n + (/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\p{Extended_Pictographic}]/u.test(ch) ? 2 : 1)
  }, 0)

import type { SessionRateLimit } from 'claude-code'

import { isReset } from './limits'

/**
 * 펫 진화: 한 주가 한 세대. 주간 한도 사용률(없으면 함께한 날 수나 달러 예산)로 1~3단계.
 * 상태는 $.store의 'grow' 하나. 여기 함수들은 모두 순수하다 (시각은 인자로)
 */
export type Stage = 1 | 2 | 3
/** 그 주에 가장 많이 일한 시간대 */
export type Style = 'owl' | 'morning' | 'day'
export type AlbumEntry = { start: string; pet: string; stage: Stage; pats: number; style: Style | null }
export type GrowWeek = {
  /** 이 주가 시작된 날 'YYYY-MM-DD' (한도 주는 resetsAt−7일, 모르면 처음 본 날) */
  start: string
  /** 날 수·예산 주의 월요일 'YYYY-MM-DD'. 한도 주는 null */
  monday: string | null
  /** 한도 주의 마지막 읽기 (리셋 판정 재료) */
  limit: { resetsAt: string | null; percent: number } | null
  peak: Stage
  pats: number
  /** 답변을 끝낸 날들 'YYYY-MM-DD' */
  days: string[]
  /** 시(0~23)별 끝난 답변 수, 길이 24 */
  hours: number[]
  spentUsd: number
}
export type Grow = {
  /** 한 번이라도 한도를 본 계정은 'limit': 한도 읽기로만 주를 넘긴다 */
  source: 'limit' | 'cal'
  week: GrowWeek | null
  /** 지금까지 도달한 최고 단계 (리셋을 끈 사람에게 보여 준다) */
  kept: Stage
  lastSeen: number | null
  album: AlbumEntry[]
  /** 세션 id → 마지막으로 본 누적 비용(USD). 최근 20개 */
  costs: Record<string, number>
}
export type Reading = { kind: 'limit'; percent: number; resetsAt: string | null } | { kind: 'none' }
export type GrowSettings = { reset: boolean; budgetUsd: number | null }

const DAY = 86400000
const ALBUM_MAX = 52
const COSTS_MAX = 20
const WELCOME_MS = DAY

export const EMPTY_GROW: Grow = { source: 'cal', week: null, kept: 1, lastSeen: null, album: [], costs: {} }

export const stageOfPercent = (percent: number): Stage => (percent >= 66 ? 3 : percent >= 33 ? 2 : 1)
export const stageOfDays = (days: number): Stage => (days >= 4 ? 3 : days >= 2 ? 2 : 1)
const maxStage = (a: Stage, b: Stage): Stage => (a >= b ? a : b)

const pad = (n: number) => String(n).padStart(2, '0')
/** 이 컴퓨터 시간대의 날 */
export const localDay = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** 그 주 월요일의 날 */
export const mondayOf = (ms: number): string => {
  const d = new Date(ms)
  const back = (d.getDay() + 6) % 7
  return localDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, 12).getTime())
}

const isOwl = (h: number) => h >= 22 || h <= 4
const isMorning = (h: number) => h >= 5 && h <= 10
export const styleOf = (hours: readonly number[]): Style | null => {
  const sum = (test: (h: number) => boolean) => hours.reduce((n, c, h) => n + (test(h) ? c : 0), 0)
  const owl = sum(isOwl)
  const morning = sum(isMorning)
  const day = sum(h => !isOwl(h) && !isMorning(h))
  if (owl + morning + day === 0) return null
  // 같으면 낮 > 아침 > 올빼미
  if (day >= morning && day >= owl) return 'day'
  return morning >= owl ? 'morning' : 'owl'
}

const newWeek = (start: string, monday: string | null, limit: GrowWeek['limit'], peak: Stage): GrowWeek => ({
  start,
  monday,
  limit,
  peak,
  pats: 0,
  days: [],
  hours: Array(24).fill(0) as number[],
  spentUsd: 0,
})

const calWeek = (now: number) => newWeek(mondayOf(now), mondayOf(now), null, 1)

const limitStart = (resetsAt: string | null, now: number) => {
  const ms = resetsAt === null ? NaN : Date.parse(resetsAt)
  return localDay(Number.isFinite(ms) ? ms - 7 * DAY : now)
}

const hasActivity = (week: GrowWeek) =>
  week.limit !== null || week.pats > 0 || week.days.length > 0 || week.spentUsd > 0

/** 지난 주를 앨범에 넣는다 (한 일이 있었을 때만) */
const roll = (grow: Grow, pet: string, next: GrowWeek): { grow: Grow; rolled: AlbumEntry | null } => {
  const old = grow.week
  const rolled =
    old !== null && hasActivity(old)
      ? { start: old.start, pet, stage: old.peak, pats: old.pats, style: styleOf(old.hours) }
      : null
  const album = rolled === null ? grow.album : [...grow.album, rolled].slice(-ALBUM_MAX)
  return { grow: { ...grow, week: next, album }, rolled }
}

/** 읽기를 반영한다: 주 넘김(앨범 한 줄), 소스 고정 */
export const observe = (grow: Grow, reading: Reading, now: number, pet: string): { grow: Grow; rolled: AlbumEntry | null } => {
  if (reading.kind === 'limit') {
    const week = grow.week
    const base: Grow = { ...grow, source: 'limit' }
    if (week === null || grow.source !== 'limit') {
      const fresh = newWeek(limitStart(reading.resetsAt, now), null, { resetsAt: reading.resetsAt, percent: reading.percent }, stageOfPercent(reading.percent))
      // 날 수로 지내던 주가 있으면 그 주는 앨범으로
      return week === null ? { grow: { ...base, week: fresh }, rolled: null } : roll(base, pet, fresh)
    }
    if (week.limit === null) {
      return { grow: { ...base, week: { ...week, limit: { resetsAt: reading.resetsAt, percent: reading.percent } } }, rolled: null }
    }
    const now7: SessionRateLimit = {
      kind: 'seven_day',
      percentUsed: reading.percent,
      ...(reading.resetsAt === null ? {} : { resetsAt: reading.resetsAt }),
    } as SessionRateLimit
    // 잠깐 빠진 리셋 시각은 알던 것을 지킨다
    const resetsAt = reading.resetsAt ?? week.limit.resetsAt
    if (isReset(week.limit, now7)) {
      return roll(base, pet, newWeek(limitStart(resetsAt, now), null, { resetsAt, percent: reading.percent }, 1))
    }
    return { grow: { ...base, week: { ...week, limit: { resetsAt, percent: reading.percent } } }, rolled: null }
  }
  if (grow.source === 'limit') return { grow, rolled: null }
  if (grow.week === null) return { grow: { ...grow, week: calWeek(now) }, rolled: null }
  if (grow.week.monday === mondayOf(now)) return { grow, rolled: null }
  return roll(grow, pet, calWeek(now))
}

/** 이번 주 단계 (리셋 설정 무시). 한도가 있으면 한도, 아니면 예산, 아니면 날 수 */
export const weekStage = (grow: Grow, reading: Reading, budgetUsd: number | null): Stage => {
  if (reading.kind === 'limit') return stageOfPercent(reading.percent)
  const week = grow.week
  if (grow.source === 'limit') return week?.limit ? stageOfPercent(week.limit.percent) : 1
  if (week === null) return 1
  if (budgetUsd !== null && budgetUsd > 0) return stageOfPercent((week.spentUsd / budgetUsd) * 100)
  return stageOfDays(week.days.length)
}

export const shownStage = (grow: Grow, reading: Reading, settings: GrowSettings): Stage => {
  const stage = weekStage(grow, reading, settings.budgetUsd)
  return settings.reset ? stage : maxStage(stage, grow.kept)
}

/** 이번 주 최고 단계와 지금까지의 최고 단계를 올린다. 이번 주 최고보다 커졌으면 evolved */
export const noteStage = (grow: Grow, stage: Stage): { grow: Grow; evolved: Stage | null } => {
  const kept = maxStage(grow.kept, stage)
  if (grow.week === null || stage <= grow.week.peak) return { grow: kept === grow.kept ? grow : { ...grow, kept }, evolved: null }
  return { grow: { ...grow, kept, week: { ...grow.week, peak: stage } }, evolved: stage }
}

/** 주가 없으면 만든다 (한도 계정은 한도 읽기가 올 때까지 limit 없이) */
const ensureWeek = (grow: Grow, now: number): GrowWeek =>
  grow.week ?? (grow.source === 'limit' ? newWeek(localDay(now), null, null, 1) : calWeek(now))

export const recordAnswer = (grow: Grow, now: number): Grow => {
  const week = ensureWeek(grow, now)
  const day = localDay(now)
  const hours = [...week.hours]
  const hour = new Date(now).getHours()
  hours[hour] = (hours[hour] ?? 0) + 1
  return { ...grow, week: { ...week, days: week.days.includes(day) ? week.days : [...week.days, day], hours } }
}

export const recordCost = (grow: Grow, sessionId: string, usd: number, now = Date.now()): Grow => {
  if (!Number.isFinite(usd) || usd < 0) return grow
  const week = ensureWeek(grow, now)
  const last = grow.costs[sessionId]
  // 줄었으면 /clear로 새로 센 것
  const delta = last === undefined || usd < last ? usd : usd - last
  const { [sessionId]: _old, ...rest } = grow.costs
  const costs = Object.fromEntries([...Object.entries(rest), [sessionId, usd]].slice(-COSTS_MAX))
  return { ...grow, costs, week: { ...week, spentUsd: Math.round((week.spentUsd + delta) * 1e6) / 1e6 } }
}

export const recordPat = (grow: Grow, now = Date.now()): Grow => {
  const week = ensureWeek(grow, now)
  return { ...grow, week: { ...week, pats: week.pats + 1 } }
}

/** 하루 넘게 못 봤으면 반긴다. 항상 lastSeen을 지금으로 */
export const seen = (grow: Grow, now: number): { grow: Grow; welcome: boolean } => ({
  grow: { ...grow, lastSeen: now },
  welcome: grow.lastSeen !== null && now - grow.lastSeen >= WELCOME_MS,
})

/* ---------- 저장된 값 읽기 ---------- */

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStage = (v: unknown): v is Stage => v === 1 || v === 2 || v === 3
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isStyle = (v: unknown): v is Style => v === 'owl' || v === 'morning' || v === 'day'

const parseEntry = (v: unknown): AlbumEntry | null =>
  isRecord(v) && isDay(v.start) && typeof v.pet === 'string' && isStage(v.stage) && isCount(v.pats) && (v.style === null || isStyle(v.style))
    ? { start: v.start, pet: v.pet, stage: v.stage, pats: v.pats, style: v.style }
    : null

const parseWeek = (v: unknown): GrowWeek | null => {
  if (!isRecord(v) || !isDay(v.start) || !(v.monday === null || isDay(v.monday)) || !isStage(v.peak) || !isCount(v.pats)) return null
  const limit = v.limit
  const limitOk =
    limit === null ||
    (isRecord(limit) && (limit.resetsAt === null || typeof limit.resetsAt === 'string') && typeof limit.percent === 'number')
  if (!limitOk) return null
  if (!Array.isArray(v.days) || !v.days.every(isDay)) return null
  if (!Array.isArray(v.hours) || v.hours.length !== 24 || !v.hours.every(isCount)) return null
  if (typeof v.spentUsd !== 'number' || !Number.isFinite(v.spentUsd) || v.spentUsd < 0) return null
  return {
    start: v.start,
    monday: v.monday,
    limit: limit === null ? null : { resetsAt: (limit as { resetsAt: string | null }).resetsAt, percent: (limit as { percent: number }).percent },
    peak: v.peak,
    pats: v.pats,
    days: [...v.days],
    hours: [...v.hours],
    spentUsd: v.spentUsd,
  }
}

/** 저장된 값: 망가진 칸은 기본값 */
export const parseGrow = (raw: unknown): Grow => {
  if (!isRecord(raw)) return EMPTY_GROW
  const album = Array.isArray(raw.album) ? raw.album.map(parseEntry).filter((e): e is AlbumEntry => e !== null).slice(-ALBUM_MAX) : []
  const costs = isRecord(raw.costs)
    ? Object.fromEntries(Object.entries(raw.costs).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0).slice(-COSTS_MAX))
    : {}
  return {
    source: raw.source === 'limit' ? 'limit' : 'cal',
    week: parseWeek(raw.week),
    kept: isStage(raw.kept) ? raw.kept : 1,
    lastSeen: typeof raw.lastSeen === 'number' && Number.isFinite(raw.lastSeen) ? raw.lastSeen : null,
    album,
    costs: costs as Record<string, number>,
  }
}

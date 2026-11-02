import type { SessionRateLimit } from 'claude-code'

/** 알리는 단계. 사용자가 정했다: 80%부터 5% 단위, 마지막은 99% */
export const LIMIT_STEPS = [80, 85, 90, 95, 99] as const

/**
 * 5시간 창은 무시한다: 사용자에 따르면 정책에서 없어졌고, 엔진이 아직 보내 준다면
 * 5시간마다 리셋되어 하루에도 여러 번 알리게 된다
 */
const IGNORED = new Set(['five_hour'])

const WEEK = 7 * 86400000

/** 창마다 이번 리셋 주기에 마지막으로 알린 단계 */
export type LimitSeen = Record<string, { resetsAt: string | null; step: number }>

export type LimitAlert = {
  kind: string
  step: number
  percent: number
  /** 리셋 시각(ms). 엔진이 알려주지 않으면 null */
  resetsAt: number | null
  /** 지금 속도로 바닥날 시각(ms). 리셋 전에 바닥나지 않거나 알 수 없으면 null */
  emptyAt: number | null
}

const parseTime = (iso: string | undefined): number | null => {
  if (iso === undefined) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** 주간 창만: 이번 주의 경과 시간과 사용률로 단순 선형 예상 */
const forecast = (kind: string, percent: number, resetsAt: number | null, now: number): number | null => {
  if (kind !== 'seven_day' || resetsAt === null || percent <= 0) return null
  const start = resetsAt - WEEK
  const elapsed = now - start
  if (elapsed <= 0) return null
  const emptyAt = start + (elapsed * 100) / percent
  return emptyAt < resetsAt ? Math.round(emptyAt) : null
}

/**
 * 새로 넘은 단계가 있으면 알림 하나(여러 창이면 가장 높은 단계)와 갱신된 기록.
 * 같은 리셋 주기 안에서는 단계마다 한 번만 알린다
 */
export const limitAlert = (
  windows: readonly SessionRateLimit[],
  seen: LimitSeen,
  now: number,
): { alert: LimitAlert | null; seen: LimitSeen } => {
  const next: LimitSeen = { ...seen }
  let alert: LimitAlert | null = null
  for (const window of windows) {
    if (IGNORED.has(window.kind)) continue
    const resetsAt = window.resetsAt ?? null
    const before = seen[window.kind]
    const last = before !== undefined && before.resetsAt === resetsAt ? before.step : 0
    const step = [...LIMIT_STEPS].reverse().find(s => window.percentUsed >= s) ?? 0
    if (step === 0 && before?.resetsAt !== resetsAt) {
      // 리셋된 뒤 아직 80% 전: 기록만 새 주기로
      if (before !== undefined) next[window.kind] = { resetsAt, step: 0 }
      continue
    }
    if (step <= last) continue
    next[window.kind] = { resetsAt, step }
    if (alert === null || step > alert.step) {
      const reset = parseTime(window.resetsAt)
      alert = {
        kind: window.kind,
        step,
        percent: window.percentUsed,
        resetsAt: reset,
        emptyAt: forecast(window.kind, window.percentUsed, reset, now),
      }
    }
  }
  return { alert, seen: next }
}

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
export type LimitSeen = Record<string, { resetsAt: string | null; step: number; percent?: number }>

const HOUR = 3600000
/** 사용률이 이만큼 이상 떨어지면 새 주기로 본다 (한도는 리셋 말고는 줄지 않는다) */
const DROP = 5

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
 * 한도가 리셋됐는지. 글자가 달라졌다고 리셋은 아니다: 같은 시각을 다르게 적거나
 * resetsAt이 있다 없다 하는 것은 리셋이 아니다. 리셋 시각이 몇 시간 이상 뒤로 밀렸거나
 * (resetsAt을 모를 때를 위해) 사용률이 크게 떨어졌을 때만
 */
const isReset = (before: { resetsAt: string | null; percent?: number }, now: SessionRateLimit): boolean => {
  const was = parseTime(before.resetsAt ?? undefined)
  const next = parseTime(now.resetsAt)
  if (was !== null && next !== null && next - was >= HOUR) return true
  return before.percent !== undefined && now.percentUsed <= before.percent - DROP
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
    const before = seen[window.kind]
    const fresh = before === undefined || isReset(before, window)
    const last = fresh ? 0 : before.step
    const step = [...LIMIT_STEPS].reverse().find(s => window.percentUsed >= s) ?? 0
    // 리셋 시각은 알게 된 것을 지킨다: 잠깐 빠졌다고 지우지 않는다
    const resetsAt = window.resetsAt ?? (fresh ? null : before.resetsAt)
    const kept = fresh ? 0 : last
    if (step <= last) {
      next[window.kind] = { resetsAt, step: kept, percent: window.percentUsed }
      continue
    }
    next[window.kind] = { resetsAt, step, percent: window.percentUsed }
    if (alert === null || step > alert.step) {
      const reset = parseTime(resetsAt ?? undefined)
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

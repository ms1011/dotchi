import type { RestRule } from '../types'

const HOUR = 3600000

/**
 * 오래 쉬고 큰 대화를 이어가려 할 때 경고할지.
 * 1시간이 지나 캐시가 만료되면 그 뒤로는 비용이 대화 크기(토큰)로 정해진다.
 * 기준 시간은 사용자가 정했다: 퇴근-출근 정도로는 울리지 않게 24시간
 */
export const shouldWarnRest = (
  lastTurnAt: number | null,
  now: number,
  tokens: number | undefined,
  rule: RestRule | null,
): boolean => {
  if (rule === null || lastTurnAt === null || tokens === undefined) return false
  return now - lastTurnAt >= rule.hours * HOUR && tokens >= rule.tokens
}

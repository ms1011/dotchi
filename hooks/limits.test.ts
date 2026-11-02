import { expect, test } from 'claude-code/testing'

import { limitAlert } from './limits'

const DAY = 86400000
const RESET = '2026-11-09T00:00:00.000Z'
const resetMs = Date.parse(RESET)
const week = (percentUsed: number, resetsAt: string | null = RESET) =>
  resetsAt === null ? { kind: 'seven_day', percentUsed } : { kind: 'seven_day', percentUsed, resetsAt }

/** 리셋 3일 전(4일째) */
const NOW = resetMs - 3 * DAY

test('80% 전에는 알리지 않는다', () => {
  expect(limitAlert([week(79.9)], {}, NOW).alert).toBe(null)
})

test('80%를 넘으면 80 단계', () => {
  const { alert, seen } = limitAlert([week(80)], {}, NOW)
  expect(alert?.step).toBe(80)
  expect(alert?.percent).toBe(80)
  expect(alert?.resetsAt).toBe(resetMs)
  expect(seen.seven_day).toEqual({ resetsAt: RESET, step: 80, percent: 80 })
})

test('같은 단계 안의 변화는 알리지 않는다', () => {
  const first = limitAlert([week(80)], {}, NOW)
  expect(limitAlert([week(84)], first.seen, NOW).alert).toBe(null)
})

test('여러 단계를 한꺼번에 넘으면 가장 높은 단계 하나만', () => {
  const first = limitAlert([week(78)], {}, NOW)
  const second = limitAlert([week(91)], first.seen, NOW)
  expect(second.alert?.step).toBe(90)
  expect(limitAlert([week(92)], second.seen, NOW).alert).toBe(null)
  expect(limitAlert([week(99)], second.seen, NOW).alert?.step).toBe(99)
})

test('리셋되면(resetsAt이 바뀌면) 처음부터 다시 센다', () => {
  const { seen } = limitAlert([week(95)], {}, NOW)
  const next = '2026-11-16T00:00:00.000Z'
  expect(limitAlert([week(81, next)], seen, NOW + 7 * DAY).alert?.step).toBe(80)
})

test('five_hour 창은 무시한다', () => {
  expect(limitAlert([{ kind: 'five_hour', percentUsed: 95, resetsAt: RESET }], {}, NOW).alert).toBe(null)
})

test('다른 창(spend_limit 등)은 알린다', () => {
  expect(limitAlert([{ kind: 'spend_limit', percentUsed: 85 }], {}, NOW).alert?.step).toBe(85)
})

test('창이 없으면 아무 일도 없다', () => {
  expect(limitAlert([], {}, NOW)).toEqual({ alert: null, seen: {} })
})

test('resetsAt이 없으면 예상 없이 알린다', () => {
  const { alert } = limitAlert([week(85, null)], {}, NOW)
  expect(alert?.step).toBe(85)
  expect(alert?.resetsAt).toBe(null)
  expect(alert?.emptyAt).toBe(null)
})

test('빠르게 쓰면 바닥나는 시각을 예상한다', () => {
  // 4일 만에 80%: 5일째에 바닥 → 리셋보다 2일 먼저
  const { alert } = limitAlert([week(80)], {}, NOW)
  expect(alert?.emptyAt).toBe(resetMs - 7 * DAY + 5 * DAY)
})

test('리셋 전에 바닥나지 않을 속도면 예상을 뺀다', () => {
  // 6.5일 만에 90%: 바닥은 7.2일째, 리셋 뒤
  const { alert } = limitAlert([week(90)], {}, resetMs - DAY / 2)
  expect(alert?.emptyAt).toBe(null)
})

test('resetsAt이 계속 없어도 사용률이 떨어지면 새 주기로 센다', () => {
  const first = limitAlert([week(95, null)], {}, NOW)
  expect(first.alert?.step).toBe(95)
  expect(limitAlert([week(96, null)], first.seen, NOW).alert).toBe(null)
  expect(limitAlert([week(81, null)], first.seen, NOW + 7 * DAY).alert?.step).toBe(80)
})

test('같은 시각을 다르게 적어도, 있다 없다 해도 리셋이 아니다', () => {
  const first = limitAlert([week(85)], {}, NOW)
  expect(limitAlert([week(86, '2026-11-09T00:00:00Z')], first.seen, NOW).alert).toBe(null)
  const gone = limitAlert([week(86, null)], first.seen, NOW)
  expect(gone.alert).toBe(null)
  expect(limitAlert([week(87)], gone.seen, NOW).alert).toBe(null)
})

test('resetsAt이 몇 시간 이상 뒤로 밀리면 리셋', () => {
  const first = limitAlert([week(95)], {}, NOW)
  const next = limitAlert([week(81, '2026-11-16T00:00:00.000Z')], first.seen, NOW)
  expect(next.alert?.step).toBe(80)
})

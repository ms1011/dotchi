import { expect, test } from 'claude-code/testing'

import { DEFAULT_LOOK, isThemeId, parseTheme, setThemeKey, themeNameOf, THEME_KEYS } from './theme'

const theme = (over: Record<string, unknown> = {}) => JSON.stringify({ format: 1, id: 'candy', name: { ko: '사탕', en: 'Candy' }, ...over })

test('빈 칸은 기본 모양으로 채운다', () => {
  const parsed = parseTheme(theme())
  expect(parsed?.meta).toEqual({ format: 1, id: 'candy', name: { ko: '사탕', en: 'Candy' } })
  expect(parsed?.look).toEqual(DEFAULT_LOOK)
})

test('기본 모양은 지금까지의 파스텔, 강조색은 펫 색', () => {
  expect(DEFAULT_LOOK).toEqual({
    colors: { ok: '#8fd9b6', warn: '#ffd86b', danger: '#ff8fa3', dim: '#9a9ab0', accent: 'pet' },
    faces: { ok: '(•ᴗ•)', warn: '(•_•;)', danger: '(×_×)' },
    hearts: ['♥', '♡'],
    bar: ['▰', '▱'],
    symbols: { week: '⚡', tired: '🥱', reset: '↻', time: '⏱' },
  })
})

test('일부만 적어도 받고, 색은 소문자로', () => {
  const parsed = parseTheme(
    theme({ colors: { ok: '#FF00AA', accent: '#123456' }, faces: { danger: '(╥_╥)' }, hearts: ['🍬', '·'], symbols: { week: '🔋' } }),
  )
  expect(parsed?.look.colors).toEqual({ ...DEFAULT_LOOK.colors, ok: '#ff00aa', accent: '#123456' })
  expect(parsed?.look.faces).toEqual({ ...DEFAULT_LOOK.faces, danger: '(╥_╥)' })
  expect(parsed?.look.hearts).toEqual(['🍬', '·'])
  expect(parsed?.look.symbols.week).toBe('🔋')
})

test('틀린 값이 있으면 테마 전체를 받지 않는다', () => {
  const bad = [
    { format: 2 },
    { id: 'Bad Id' },
    { name: '' },
    { colors: { ok: 'pink' } },
    { colors: { ok: '#fff' } },
    { colors: { accent: 'pets' } },
    { faces: { ok: '' } },
    { faces: { ok: 'x'.repeat(13) } },
    { faces: { ok: 'a\nb' } },
    { faces: { ok: 'a`b' } },
    { hearts: ['♥'] },
    { hearts: ['♥', ' '] },
    { bar: ['▰', 'abcde'] },
    { symbols: { week: 'a b' } },
    { symbols: { week: 3 } },
    { description: 'x'.repeat(301) },
    { name: 'x'.repeat(41) },
  ]
  for (const over of bad) expect(parseTheme(theme(over))).toBe(null)
  expect(parseTheme('{')).toBe(null)
})

test('얼굴 안의 공백은 괜찮다', () => {
  expect(parseTheme(theme({ faces: { ok: '( ^ω^ )' } }))?.look.faces.ok).toBe('( ^ω^ )')
})

test('테마 id: 소문자·숫자·-, 하위 명령 이름은 안 된다', () => {
  expect(isThemeId('candy')).toBe(true)
  expect(isThemeId('list')).toBe(false)
  expect(isThemeId('new')).toBe(false)
  expect(isThemeId('Candy')).toBe(false)
})

test('이름: 지금 언어 → 영어 → 첫 언어 → id', () => {
  const meta = parseTheme(theme())!.meta
  expect(themeNameOf(meta, 'ko')).toBe('사탕')
  expect(themeNameOf(meta, 'ja')).toBe('Candy')
  expect(themeNameOf({ ...meta, name: 'Plain' }, 'ko')).toBe('Plain')
})

test('set: 한 칸만 바꾸고, 틀리면 이유', () => {
  const raw = JSON.parse(theme({ colors: { ok: '#000000' } })) as Record<string, unknown>
  const next = setThemeKey(raw, 'color.warn', '#ABCDEF')
  expect('error' in next).toBe(false)
  if ('error' in next) return
  expect(next.colors).toEqual({ ok: '#000000', warn: '#abcdef' })
  expect(raw.colors).toEqual({ ok: '#000000' })

  const hearts = setThemeKey(raw, 'hearts', '🍬 ·')
  expect('error' in hearts ? null : hearts.hearts).toEqual(['🍬', '·'])
  const face = setThemeKey(raw, 'face.danger', '( x _ x )')
  expect('error' in face ? null : (face.faces as Record<string, string>).danger).toBe('( x _ x )')
  expect('error' in setThemeKey(raw, 'color.accent', 'pet')).toBe(false)

  expect(setThemeKey(raw, 'color.ok', 'red')).toEqual({ error: 'value' })
  expect(setThemeKey(raw, 'hearts', '♥')).toEqual({ error: 'value' })
  expect(setThemeKey(raw, 'colour.ok', '#000000')).toEqual({ error: 'key' })
  expect(THEME_KEYS).toContain('symbol.time')
})

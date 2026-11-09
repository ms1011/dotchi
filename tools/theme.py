"""상태 줄 테마 도구 (표준 라이브러리만: venv 없이 python3 으로 돈다).

사용법:
  python3 tools/theme.py check <theme.json>     hooks/theme.ts 와 같은 규칙으로 검사. 문제가 있으면 종료 코드 1
  python3 tools/theme.py preview <theme.json>   상태 줄과 옆 패널 카드를 트루컬러로 미리 보기
"""

import json
import re
import sys
from pathlib import Path

LANGS = ('ko', 'en', 'ja', 'zh')
ID = re.compile(r'^[a-z0-9-]{1,32}$')
RESERVED = {'list', 'new', 'edit', 'set', 'install', 'export', 'share', 'unshare', 'remove'}
COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
LIMITS = {'name': 40, 'description': 300}
DEFAULT = {
    'colors': {'ok': '#8fd9b6', 'warn': '#ffd86b', 'danger': '#ff8fa3', 'dim': '#9a9ab0', 'accent': 'pet'},
    'faces': {'ok': '', 'warn': '', 'danger': ''},
    'hearts': ['♥', '♡'],
    'bar': ['▰', '▱'],
    'symbols': {'week': '⚡', 'tired': '🥱', 'reset': '↻', 'time': '⏱'},
}


def _control(text):
    return any(ord(c) < 32 or 0x7f <= ord(c) < 0xa0 for c in text)


def is_glyph(value):
    """하트·막대·기호 한 자리: 1~4 코드 포인트, 공백·제어 문자·백틱 없이"""
    return isinstance(value, str) and 1 <= len(value) <= 4 and not any(c.isspace() or c == '`' for c in value) and not _control(value)


def is_face(value):
    """얼굴: 1~12 코드 포인트, 안쪽 공백은 되고 줄바꿈·제어 문자·백틱은 안 된다. 빈 값이면 얼굴 없음"""
    if value == '':
        return True
    return isinstance(value, str) and value.strip() != '' and len(value) <= 12 and '`' not in value and not _control(value)


def check_theme(path):
    """문제 목록 (비면 통과)"""
    try:
        theme = json.loads(Path(path).read_text())
    except (OSError, ValueError) as error:
        return [f'theme.json: {error}']
    if not isinstance(theme, dict):
        return ['theme.json: must be an object']
    problems = []
    if theme.get('format') != 1:
        problems.append('format must be 1')
    tid = theme.get('id')
    if not (isinstance(tid, str) and ID.match(tid) and tid not in RESERVED):
        problems.append('id must be 1-32 of a-z 0-9 - and not a theme subcommand name')
    name = theme.get('name')
    ok_name = lambda n: isinstance(n, str) and n.strip() != '' and len(n) <= LIMITS['name']
    if isinstance(name, dict):
        known = [l for l in LANGS if l in name]
        if not known or not all(ok_name(name[l]) for l in known):
            problems.append('name must be {lang: name} with non-empty names up to 40 characters')
    elif not ok_name(name):
        problems.append('name must be a non-empty string up to 40 characters, or {lang: name}')
    for key, limit in (('author', LIMITS['name']), ('description', LIMITS['description'])):
        if key in theme and not (isinstance(theme[key], str) and len(theme[key]) <= limit):
            problems.append(f'{key} must be a string up to {limit} characters')
    sections = (('colors', lambda k, v: (k == 'accent' and v == 'pet') or (isinstance(v, str) and COLOR.match(v)), '#rrggbb (accent may be "pet")'),
                ('faces', lambda k, v: is_face(v), 'up to 12 characters, no line breaks or backticks'),
                ('symbols', lambda k, v: is_glyph(v), 'one glyph: 1-4 characters, no spaces'))
    for section, ok, rule in sections:
        if section not in theme:
            continue
        value = theme[section]
        if not isinstance(value, dict):
            problems.append(f'{section} must be an object')
            continue
        for key in DEFAULT[section]:
            if key in value and not ok(key, value[key]):
                problems.append(f'{section}.{key}: {rule}')
    for pair in ('hearts', 'bar'):
        if pair in theme:
            value = theme[pair]
            if not (isinstance(value, list) and len(value) == 2 and all(is_glyph(g) for g in value)):
                problems.append(f'{pair} must be [filled, empty]: two glyphs of 1-4 characters, no spaces')
    return problems


def look_of(theme):
    """빈 칸을 기본 모양으로 채운 모양"""
    look = {k: (dict(v) if isinstance(v, dict) else list(v)) for k, v in DEFAULT.items()}
    for section in ('colors', 'faces', 'symbols'):
        look[section].update(theme.get(section, {}))
    for pair in ('hearts', 'bar'):
        if pair in theme:
            look[pair] = theme[pair]
    return look


def _paint(hex_color, text):
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return f'\x1b[38;2;{r};{g};{b}m{text}\x1b[0m'


def preview(path):
    """세 단계(여유·주의·위험)의 상태 줄과 패널 카드"""
    look = look_of(json.loads(Path(path).read_text()))
    c, f, s = look['colors'], look['faces'], look['symbols']
    accent = '#b8a6ff' if c['accent'] == 'pet' else c['accent']
    lines = []
    for percent, level, week in ((40, 'ok', 41), (78, 'warn', 83), (93, 'danger', 97)):
        k = round(percent / 20)
        hearts = look['hearts'][0] * k + look['hearts'][1] * (5 - k)
        mood = '' if level == 'ok' else f" {f[level]}{' /compact' if level == 'danger' else ''}"
        lines.append(f"상태 줄  🐾 {hearts} {percent}%{mood} · {s['week']} {week}%{' ' + s['tired'] if level == 'danger' else ''} · ⎇ main")
        bar = lambda p: look['bar'][0] * round(p / 10) + look['bar'][1] * (10 - round(p / 10))
        week_level = 'danger' if week >= 95 else 'warn' if week >= 80 else 'ok'
        lines.append('패널    ' + _paint(accent if level == 'ok' else c[level], f[level]) + ' ' + _paint(c['dim'], '세션') + ' '
                     + _paint(c[level], f'{bar(percent)} {percent}%'))
        lines.append('        ' + _paint(c[week_level], s['week']) + ' ' + _paint(c['dim'], '주간') + ' '
                     + _paint(c[week_level], f'{bar(week)} {week}%') + _paint(c['dim'], f" {s['reset']} 월 09:00"))
        lines.append('        ' + _paint(c['dim'], f"{s['time']} 12분 · Opus 5.5 · 1M"))
        lines.append('')
    if c['accent'] == 'pet':
        lines.append('(강조색 "pet": 실제로는 펫 그림의 대표색. 여기서는 라벤더로 보여 줌)')
    return '\n'.join(lines)


def main(argv):
    if len(argv) != 2 or argv[0] not in ('check', 'preview'):
        print(__doc__)
        return 2
    problems = check_theme(argv[1])
    if argv[0] == 'check' or problems:
        for problem in problems:
            print(problem)
        print('ok' if not problems else f'{len(problems)} problem(s)')
        return 1 if problems else 0
    print(preview(argv[1]))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

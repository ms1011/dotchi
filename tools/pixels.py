"""픽셀 격자 도구: 팩의 art.json 과 사람이(또는 Claude가) 고치는 격자 텍스트를 오간다.

사용법 (<pack> 은 dotchi.json 이 든 팩 폴더):
  python3 tools/pixels.py export <pack>    <pack>/art.json → <pack>/grid/*.txt
  python3 tools/pixels.py import <pack>    <pack>/grid/*.txt → <pack>/art.json
  python3 tools/pixels.py preview <pack>   <pack>/preview.png (위: source/ 원본, 아래: 확대한 컷)
  python3 tools/pixels.py gif <pack>       <pack>/preview.gif (터미널 모습, dotchi.json 의 frameMs)
  python3 tools/pixels.py check <pack>     팩 형식 1 검사 (mod가 읽을 수 있는지). 문제가 있으면 종료 코드 1
  python3 tools/pixels.py stage <pack> <n> <overlay.txt>
                                           (n−1)단계 격자 위에 덧그림을 얹어 n단계(2·3) 격자를 쓴다

격자 이름: 1단계는 idle.txt, 1.txt…5.txt. n단계(2·3)는 s<n>-idle.txt, s<n>-1.txt…s<n>-5.txt.
"""

import json
import string
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 32
MAX_FRAMES = 5
LETTERS = string.ascii_lowercase + string.ascii_uppercase + string.digits
TRANSPARENT = '.'
SCALE = 12


def frame_to_grid(frame):
    counts = Counter(c for row in frame for c in row if c is not None)
    colors = [c for c, _ in counts.most_common()]
    if len(colors) > len(LETTERS):
        raise ValueError(f'색이 너무 많아요: {len(colors)}개 (최대 {len(LETTERS)}개)')
    letter = {c: LETTERS[i] for i, c in enumerate(colors)}
    lines = ['# palette']
    lines += [f'{letter[c]}={c}' for c in colors]
    lines.append('# pixels')
    lines += [''.join(TRANSPARENT if c is None else letter[c] for c in row) for row in frame]
    return '\n'.join(lines) + '\n'


def grid_to_frame(text):
    lines = text.split('\n')
    palette = {}
    rows = []
    section = None
    for number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped == '# palette':
            section = 'palette'
            continue
        if stripped == '# pixels':
            section = 'pixels'
            continue
        if not stripped:
            continue
        if section == 'palette':
            key, sep, value = stripped.partition('=')
            value = value.strip().lower().lstrip('#')
            if not sep or len(key) != 1 or len(value) != 6 or any(ch not in '0123456789abcdef' for ch in value):
                raise ValueError(f'{number}번째 줄: 팔레트는 "a=rrggbb" 모양이어야 해요')
            palette[key] = value
        elif section == 'pixels':
            if len(stripped) != SIZE:
                raise ValueError(f'{number}번째 줄: 한 줄은 {SIZE}글자여야 해요 (지금 {len(stripped)}글자)')
            row = []
            for ch in stripped:
                if ch == TRANSPARENT:
                    row.append(None)
                elif ch in palette:
                    row.append(palette[ch])
                else:
                    raise ValueError(f'{number}번째 줄: 팔레트에 없는 글자 "{ch}"')
            rows.append(row)
        else:
            raise ValueError(f'{number}번째 줄: "# palette" 또는 "# pixels" 아래에 있어야 해요')
    if len(rows) != SIZE:
        raise ValueError(f'픽셀은 {SIZE}줄이어야 해요 (지금 {len(rows)}줄)')
    return rows


PICTURE_SUFFIXES = {'.png', '.webp', '.jpg', '.jpeg'}
DEFAULT_FRAME_MS = 250


def load_art(pack):
    return json.loads((Path(pack) / 'art.json').read_text())


def save_art(pack, idle, work, stages=None):
    art = {'width': SIZE, 'height': SIZE, 'idle': idle, 'work': work[:MAX_FRAMES]}
    if stages:
        art['stages'] = {k: {'idle': v['idle'], 'work': v['work'][:MAX_FRAMES]} for k, v in sorted(stages.items())}
    path = Path(pack) / 'art.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(art, separators=(',', ':')))
    return path


def frame_ms(pack):
    try:
        value = json.loads((Path(pack) / 'dotchi.json').read_text()).get('frameMs')
    except (OSError, ValueError):
        return DEFAULT_FRAME_MS
    return value if isinstance(value, int) else DEFAULT_FRAME_MS


def numbered(paths, prefix=''):
    """'1.txt', '2.png' 처럼 이름이 (prefix 뒤) 숫자인 파일만 숫자 순으로."""
    found = []
    for p in paths:
        stem = p.stem[len(prefix):] if p.stem.startswith(prefix) else None
        if stem is not None and stem.isdigit():
            found.append((int(stem), p))
    return [p for _, p in sorted(found)]


STAGE_KEYS = ('2', '3')


def stage_prefix(stage):
    """격자 이름 앞부분: 1단계는 '', n단계는 's<n>-'"""
    return '' if str(stage) == '1' else f's{stage}-'


def stages_of(art):
    """[(단계 이름, idle, work)]: 1단계와 실린 단계들"""
    out = [('1', art['idle'], art['work'])]
    for key in STAGE_KEYS:
        stage = (art.get('stages') or {}).get(key)
        if stage:
            out.append((key, stage['idle'], stage['work']))
    return out


def export_pack(pack):
    art = load_art(pack)
    d = Path(pack) / 'grid'
    d.mkdir(parents=True, exist_ok=True)
    for old in d.glob('*.txt'):
        old.unlink()
    for key, idle, work in stages_of(art):
        prefix = stage_prefix(key)
        (d / f'{prefix}idle.txt').write_text(frame_to_grid(idle))
        for n, frame in enumerate(work, start=1):
            (d / f'{prefix}{n}.txt').write_text(frame_to_grid(frame))
    return d


def read_stage(d, prefix):
    """한 단계의 격자들 → (idle, work). 격자가 하나도 없으면 None"""
    files = numbered(d.glob(f'{prefix}*.txt'), prefix)
    idle_file = d / f'{prefix}idle.txt'
    if not files and not idle_file.exists():
        return None
    work = [read_grid(path) for path in files[:MAX_FRAMES]]
    idle = read_grid(idle_file) if idle_file.exists() else work[0]
    return idle, work or [idle]


def import_pack(pack):
    d = Path(pack) / 'grid'
    first = read_stage(d, '') if d.exists() else None
    if first is None:
        raise ValueError(f'{d}: grid에 컷이 없어요')
    stages = {}
    for key in STAGE_KEYS:
        stage = read_stage(d, stage_prefix(key))
        if stage is not None:
            stages[key] = {'idle': stage[0], 'work': stage[1]}
    return save_art(pack, first[0], first[1], stages)


def overlay(frame, over):
    """덧그림의 투명하지 않은 칸만 위에 얹는다"""
    return [[o if o is not None else c for c, o in zip(row, over_row)] for row, over_row in zip(frame, over)]


def stage_pack(pack, stage, overlay_path):
    """(n−1)단계 격자(없으면 그 아래) 위에 덧그림을 얹어 n단계 격자를 쓴다"""
    if str(stage) not in STAGE_KEYS:
        raise ValueError('단계는 2 또는 3이어야 해요')
    d = Path(pack) / 'grid'
    over = read_grid(Path(overlay_path))
    below = None
    for key in [str(k) for k in range(int(stage) - 1, 0, -1)]:
        below = read_stage(d, stage_prefix(key)) if d.exists() else None
        if below is not None:
            break
    if below is None:
        raise ValueError(f'{d}: 아래 단계 격자가 없어요')
    prefix = stage_prefix(stage)
    for old in d.glob(f'{prefix}*.txt'):
        old.unlink()
    idle, work = below
    (d / f'{prefix}idle.txt').write_text(frame_to_grid(overlay(idle, over)))
    for n, frame in enumerate(work, start=1):
        (d / f'{prefix}{n}.txt').write_text(frame_to_grid(overlay(frame, over)))
    return d


def read_grid(path):
    try:
        return grid_to_frame(path.read_text())
    except ValueError as error:
        raise ValueError(f'{path.name}: {error}') from None


def originals(pack):
    """사용자가 넣은 원본 그림들: <pack>/source/"""
    d = Path(pack) / 'source'
    if not d.exists():
        return []
    return sorted(p for p in d.iterdir() if p.suffix.lower() in PICTURE_SUFFIXES)


def render_frame(frame):
    img = Image.new('RGB', (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(img)
    for y, row in enumerate(frame):
        for x, c in enumerate(row):
            if c is None:
                fill = (235, 235, 235) if (x + y) % 2 == 0 else (215, 215, 215)
            else:
                fill = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
            draw.rectangle([x * SCALE, y * SCALE, (x + 1) * SCALE - 1, (y + 1) * SCALE - 1], fill=fill)
    for i in range(SIZE + 1):
        draw.line([(i * SCALE, 0), (i * SCALE, SIZE * SCALE)], fill=(160, 160, 160))
        draw.line([(0, i * SCALE), (SIZE * SCALE, i * SCALE)], fill=(160, 160, 160))
    return img


def preview_pack(pack):
    art = load_art(pack)
    rows = [(f'stage {key} ', [('idle', idle)] + [(str(n), f) for n, f in enumerate(work, start=1)]) for key, idle, work in stages_of(art)]
    if len(rows) == 1:
        rows = [('', rows[0][1])]
    gap, label = 16, 20
    tile = SIZE * SCALE
    pictures = []
    for path in originals(pack):
        with Image.open(path) as img:
            img = img.convert('RGBA')
            width = max(1, round(img.width * 256 / img.height))
            pictures.append(img.resize((width, 256)))
    top = (256 + gap) if pictures else 0
    width = max(max(len(frames) for _, frames in rows) * (tile + gap), sum(p.width + gap for p in pictures)) + gap
    height = top + (label + tile + gap) * len(rows) + gap
    sheet = Image.new('RGB', (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(sheet)
    x = gap
    for picture in pictures:
        sheet.paste(picture, (x, gap), picture)
        x += picture.width + gap
    for i, (title, frames) in enumerate(rows):
        y = top + gap + i * (label + tile + gap)
        x = gap
        for name, frame in frames:
            draw.text((x, y), f'{title}{name}', fill=(0, 0, 0))
            sheet.paste(render_frame(frame), (x, y + label))
            x += tile + gap
    out = Path(pack) / 'preview.png'
    sheet.save(out)
    return out


def render_terminal(frame, cell_w=8, cell_h=16, background=(30, 30, 36)):
    """터미널에서 보이는 모습: 한 칸에 위아래 두 점, 어두운 배경"""
    img = Image.new('RGB', (SIZE * cell_w, SIZE // 2 * cell_h), background)
    draw = ImageDraw.Draw(img)
    for row in range(SIZE // 2):
        for x in range(SIZE):
            for i, c in enumerate((frame[2 * row][x], frame[2 * row + 1][x])):
                if c is None:
                    continue
                y0 = row * cell_h + i * cell_h // 2
                rgb = tuple(int(c[k:k + 2], 16) for k in (0, 2, 4))
                draw.rectangle([x * cell_w, y0, (x + 1) * cell_w - 1, y0 + cell_h // 2 - 1], fill=rgb)
    return img


def gif_pack(pack):
    """단계가 있으면 1→2→3단계로 자라는 모습 (단계마다 움직임 두 바퀴)"""
    art = load_art(pack)
    stages = stages_of(art)
    loops = 2 if len(stages) > 1 else 1
    images = [render_terminal(f) for _, _, work in stages for _ in range(loops) for f in work]
    out = Path(pack) / 'preview.gif'
    images[0].save(out, save_all=True, append_images=images[1:], duration=frame_ms(pack), loop=0, disposal=2)
    return out


LANGS = ('ko', 'en', 'ja', 'zh')
RESERVED = {'list', 'hatch', 'edit', 'install', 'export', 'remove', 'show', 'voice', 'lang', 'share', 'unshare', 'line', 'theme',
            'grow', 'album', 'evolve'}
ID = __import__('re').compile(r'^[a-z0-9-]{1,32}$')
HEX = __import__('re').compile(r'^[0-9a-f]{6}$')


def _load(path, problems):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError) as error:
        problems.append(f'{path.name}: {error}')
        return None


def _frame_ok(frame):
    return (isinstance(frame, list) and len(frame) == SIZE
            and all(isinstance(row, list) and len(row) == SIZE
                    and all(c is None or (isinstance(c, str) and HEX.match(c)) for c in row) for row in frame))


def check_pack(pack):
    """hooks/packs.ts·dots.ts 와 같은 규칙으로 팩을 검사해 문제 목록을 돌려준다 (비면 통과)"""
    pack = Path(pack)
    problems = []
    meta = _load(pack / 'dotchi.json', problems)
    if isinstance(meta, dict):
        if meta.get('format') != 1:
            problems.append('dotchi.json: format must be 1')
        if not (isinstance(meta.get('id'), str) and ID.match(meta['id']) and meta['id'] not in RESERVED):
            problems.append('dotchi.json: id must be 1-32 of a-z 0-9 - and not a subcommand name')
        name = meta.get('name')
        if not ((isinstance(name, str) and name.strip())
                or (isinstance(name, dict) and any(isinstance(name.get(l), str) and name[l].strip() for l in LANGS))):
            problems.append('dotchi.json: name must be a non-empty string or {lang: name}')
        frame_ms = meta.get('frameMs')
        if frame_ms is not None and not (isinstance(frame_ms, (int, float)) and not isinstance(frame_ms, bool) and 60 <= frame_ms <= 1000):
            problems.append('dotchi.json: frameMs must be 60-1000')
        icon = meta.get('icon')
        if icon is not None and not (isinstance(icon, str) and 1 <= len(icon) <= 8 and not any(c.isspace() or ord(c) < 32 for c in icon)):
            problems.append('dotchi.json: icon must be one emoji (1-8 characters, no spaces)')
    elif meta is not None:
        problems.append('dotchi.json: must be an object')
    art = _load(pack / 'art.json', problems)
    if isinstance(art, dict):
        if not _frame_ok(art.get('idle')):
            problems.append('art.json: idle must be 32x32 of "rrggbb" or null')
        work = art.get('work')
        if not (isinstance(work, list) and 1 <= len(work) <= MAX_FRAMES and all(_frame_ok(f) for f in work)):
            problems.append(f'art.json: work must be 1-{MAX_FRAMES} frames of 32x32')
        stages = art.get('stages')
        if stages is not None and not (
            isinstance(stages, dict) and all(
                key in STAGE_KEYS and isinstance(stage, dict) and _frame_ok(stage.get('idle'))
                and isinstance(stage.get('work'), list) and 1 <= len(stage['work']) <= MAX_FRAMES
                and all(_frame_ok(f) for f in stage['work'])
                for key, stage in stages.items())):
            problems.append(f'art.json: stages must be {{"2"|"3": {{idle, work 1-{MAX_FRAMES} frames}}}}')
    elif art is not None:
        problems.append('art.json: must be an object')
    lines = _load(pack / 'lines.json', problems)
    if isinstance(lines, dict):
        known = [l for l in LANGS if l in lines]
        if not known:
            problems.append('lines.json: needs at least one of ko en ja zh')
        for lang in known:
            entry = lines[lang]
            for key in ('spinner', 'idle', 'ending'):
                value = entry.get(key) if isinstance(entry, dict) else None
                if not (isinstance(value, list) and all(isinstance(v, str) for v in value)):
                    problems.append(f'lines.json: {lang}.{key} must be a list of strings')
    elif lines is not None:
        problems.append('lines.json: must be an object')
    return problems


def main(argv):
    if len(argv) == 2 and argv[0] == 'check':
        problems = check_pack(Path(argv[1]).expanduser())
        for problem in problems:
            print(problem, file=sys.stderr)
        print('OK' if not problems else f'{len(problems)} problem(s)')
        return 1 if problems else 0
    if len(argv) == 4 and argv[0] == 'stage':
        try:
            print(stage_pack(Path(argv[1]).expanduser(), argv[2], Path(argv[3]).expanduser()))
        except (ValueError, FileNotFoundError) as error:
            print(error, file=sys.stderr)
            return 1
        return 0
    commands = {'export': export_pack, 'import': import_pack, 'preview': preview_pack, 'gif': gif_pack}
    if len(argv) != 2 or argv[0] not in commands:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    try:
        print(commands[argv[0]](Path(argv[1]).expanduser()))
    except (ValueError, FileNotFoundError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

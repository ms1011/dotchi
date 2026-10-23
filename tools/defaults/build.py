"""기본 캐릭터 팩 만들기: characters/<id>/ 의 art.json, grid/, dotchi.json 을 쓰고 미리보기(PNG·GIF)를 만든다.

  python3 tools/defaults/build.py

대사(lines.json)는 손으로 쓴 파일이라 여기서 덮어쓰지 않는다.
"""
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import pixels  # noqa: E402
import squirrel  # noqa: E402
import turtle_pet as turtle  # noqa: E402
import tiger  # noqa: E402
import shiba  # noqa: E402
import panda  # noqa: E402
import eagle  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
CHARACTERS = REPO / 'characters'
NAMES = {
    'squirrel': {'ko': '다람쥐', 'en': 'Squirrel', 'ja': 'リス', 'zh': '松鼠'},
    'turtle': {'ko': '거북이', 'en': 'Turtle', 'ja': 'カメ', 'zh': '乌龟'},
    # 홍보하는 나라마다 하나
    'tiger': {'ko': '호랑이', 'en': 'Tiger', 'ja': 'トラ', 'zh': '老虎'},
    'shiba': {'ko': '시바견', 'en': 'Shiba', 'ja': '柴犬', 'zh': '柴犬'},
    'panda': {'ko': '판다', 'en': 'Panda', 'ja': 'パンダ', 'zh': '熊猫'},
    'eagle': {'ko': '흰머리수리', 'en': 'Bald Eagle', 'ja': 'ハクトウワシ', 'zh': '白头海雕'},
}
DESCRIPTIONS = {
    'squirrel': 'A busy squirrel that hugs an acorn and gathers ideas while Claude works.',
    'turtle': 'Looks laid-back, but sprints like the wind whenever Claude is working.',
    'tiger': 'A brave little tiger from Korea that hunts bugs while Claude works.',
    'shiba': 'A cheerful Shiba Inu from Japan that wags its tail while Claude works.',
    'panda': 'A laid-back panda from China that munches bamboo while Claude works.',
    'eagle': 'A proud bald eagle from the USA that soars over your code.',
}


def build(pid, module):
    draw = getattr(module, 'turtle' if pid == 'turtle' else pid)
    pack = CHARACTERS / pid
    pack.mkdir(parents=True, exist_ok=True)
    meta = {'format': 1, 'id': pid, 'name': NAMES[pid], 'author': 'dotchi', 'description': DESCRIPTIONS[pid], 'frameMs': module.FRAME_MS}
    (pack / 'dotchi.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2) + '\n')
    pixels.save_art(pack, draw(**module.IDLE), [draw(**pose) for pose in module.POSES])
    pixels.export_pack(pack)
    print(pixels.preview_pack(pack))
    gif = pixels.gif_pack(pack)
    (REPO / 'assets').mkdir(exist_ok=True)
    shutil.copy(gif, REPO / 'assets' / f'{pid}.gif')   # README에 쓰는 움직이는 그림
    print(gif)


if __name__ == '__main__':
    build('squirrel', squirrel)
    build('turtle', turtle)
    for pid, module in (('tiger', tiger), ('shiba', shiba), ('panda', panda), ('eagle', eagle)):
        build(pid, module)

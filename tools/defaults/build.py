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

REPO = Path(__file__).resolve().parents[2]
CHARACTERS = REPO / 'characters'
NAMES = {
    'squirrel': {'ko': '다람쥐', 'en': 'Squirrel', 'ja': 'リス', 'zh': '松鼠'},
    'turtle': {'ko': '거북이', 'en': 'Turtle', 'ja': 'カメ', 'zh': '乌龟'},
}


def build(pid, module):
    draw = getattr(module, 'turtle' if pid == 'turtle' else pid)
    pack = CHARACTERS / pid
    pack.mkdir(parents=True, exist_ok=True)
    meta = {'format': 1, 'id': pid, 'name': NAMES[pid], 'author': 'dotchi', 'frameMs': module.FRAME_MS}
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

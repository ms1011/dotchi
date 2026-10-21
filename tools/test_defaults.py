"""기본 캐릭터 팩이 형식 1을 지키고 네 언어가 모두 있는지"""
import json
import unittest
from pathlib import Path

CHARACTERS = Path(__file__).resolve().parent.parent / 'characters'
LANGS = ['ko', 'en', 'ja', 'zh']


class DefaultsTest(unittest.TestCase):
    def check(self, pid, frame_ms):
        pack = CHARACTERS / pid
        meta = json.loads((pack / 'dotchi.json').read_text())
        self.assertEqual(meta['format'], 1)
        self.assertEqual(meta['id'], pid)
        self.assertEqual(sorted(meta['name']), sorted(LANGS))
        self.assertEqual(meta['frameMs'], frame_ms)
        art = json.loads((pack / 'art.json').read_text())
        self.assertEqual((art['width'], art['height']), (32, 32))
        self.assertTrue(3 <= len(art['work']) <= 5)
        for frame in [art['idle'], *art['work']]:
            self.assertEqual(len(frame), 32)
            self.assertTrue(all(len(row) == 32 for row in frame))
        self.assertNotEqual(art['work'][0], art['work'][1])
        lines = json.loads((pack / 'lines.json').read_text())
        self.assertEqual(sorted(lines), sorted(LANGS))
        for lang in LANGS:
            for key in ('spinner', 'idle', 'ending'):
                items = [s for s in lines[lang][key] if s.strip()]
                self.assertGreaterEqual(len(items), 5, f'{pid}.{lang}.{key}')

    def test_squirrel(self):
        self.check('squirrel', 250)

    def test_turtle_is_fast(self):
        self.check('turtle', 110)


if __name__ == '__main__':
    unittest.main()

"""기본 상태 줄 테마와 tools/theme.py 검사기. 검사 규칙은 hooks/theme.ts 와 같아야 한다"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import theme as tool  # noqa: E402

THEMES = Path(__file__).resolve().parent.parent / 'themes'


class BuiltinThemesTest(unittest.TestCase):
    def load(self, tid):
        return json.loads((THEMES / tid / 'theme.json').read_text())

    def test_builtins_pass_the_check(self):
        self.assertEqual(sorted(p.name for p in THEMES.iterdir() if p.is_dir()), ['candy', 'classic', 'forest', 'modern', 'mono', 'pastel', 'rainbow'])
        for tid in ('candy', 'classic', 'forest', 'modern', 'mono', 'pastel', 'rainbow'):
            self.assertEqual(tool.check_theme(THEMES / tid / 'theme.json'), [], tid)
            theme = self.load(tid)
            self.assertEqual(theme['id'], tid)
            self.assertEqual(sorted(theme['name']), sorted(tool.LANGS))

    def test_pastel_is_the_default_look(self):
        # hooks/theme.ts 의 DEFAULT_LOOK 과 같은 값 (theme.test.ts 가 그쪽을 확인한다)
        self.assertEqual(tool.look_of(self.load('pastel')), tool.DEFAULT)
        self.assertEqual({k: self.load('pastel')[k] for k in tool.DEFAULT}, tool.DEFAULT)

    def test_mono_is_plain_ascii(self):
        theme = self.load('mono')
        glyphs = [*theme['faces'].values(), *theme['hearts'], *theme['bar'], *theme['symbols'].values()]
        self.assertTrue(all(all(32 <= ord(c) < 127 for c in g) for g in glyphs))


class CheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'theme.json'

    def tearDown(self):
        self.tmp.cleanup()

    def check(self, **over):
        self.path.write_text(json.dumps({'format': 1, 'id': 'candy', 'name': {'ko': '사탕'}, **over}, ensure_ascii=False))
        return tool.check_theme(self.path)

    def test_minimal_passes(self):
        self.assertEqual(self.check(), [])

    def test_same_rejects_as_the_mod(self):
        bad = [
            {'format': 2}, {'id': 'Bad Id'}, {'id': 'new'}, {'name': ''}, {'colors': {'ok': 'pink'}}, {'colors': {'ok': '#fff'}},
            {'colors': {'accent': 'pets'}}, {'faces': {'ok': ''}}, {'faces': {'ok': 'x' * 13}}, {'faces': {'ok': 'a\nb'}},
            {'faces': {'ok': 'a`b'}}, {'hearts': ['♥']}, {'hearts': ['♥', ' ']}, {'bar': ['▰', 'abcde']},
            {'symbols': {'week': 'a b'}}, {'symbols': {'week': 3}}, {'description': 'x' * 301}, {'name': 'x' * 41},
        ]
        for over in bad:
            self.assertNotEqual(self.check(**over), [], over)

    def test_preview_shows_three_moods(self):
        self.check(faces={'warn': 'WW', 'danger': 'DD'})
        text = tool.preview(self.path)
        self.assertIn('WW', text)
        self.assertIn('DD /compact', text)
        self.assertIn('\x1b[38;2;', text)


if __name__ == '__main__':
    unittest.main()

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pixels  # noqa: E402
from PIL import Image  # noqa: E402


def make_frame(color='ff0000'):
    frame = [[None] * 32 for _ in range(32)]
    for y in range(10, 20):
        for x in range(8, 24):
            frame[y][x] = color
    frame[12][12] = 'ffffff'
    return frame


def write_pack(pack, idle, work, frame_ms=None):
    pack.mkdir(parents=True, exist_ok=True)
    (pack / 'art.json').write_text(json.dumps({'width': 32, 'height': 32, 'idle': idle, 'work': work}))
    meta = {'format': 1, 'id': pack.name, 'name': pack.name}
    if frame_ms:
        meta['frameMs'] = frame_ms
    (pack / 'dotchi.json').write_text(json.dumps(meta))


class GridTest(unittest.TestCase):
    def test_grid_roundtrip(self):
        frame = make_frame()
        self.assertEqual(pixels.grid_to_frame(pixels.frame_to_grid(frame)), frame)

    def test_grid_bad_size_raises(self):
        lines = pixels.frame_to_grid(make_frame()).rstrip('\n').split('\n')
        with self.assertRaises(ValueError) as cm:
            pixels.grid_to_frame('\n'.join(lines[:-1]) + '\n')
        self.assertIn('32', str(cm.exception))

    def test_grid_unknown_letter_raises(self):
        lines = pixels.frame_to_grid(make_frame()).rstrip('\n').split('\n')
        first = lines.index('# pixels') + 1
        lines[first + 5] = 'z' + lines[first + 5][1:]
        with self.assertRaises(ValueError) as cm:
            pixels.grid_to_frame('\n'.join(lines) + '\n')
        self.assertIn(str(first + 5 + 1), str(cm.exception))


class PackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = Path(self.tmp.name) / 'bunny'

    def tearDown(self):
        self.tmp.cleanup()

    def grid(self):
        d = self.pack / 'grid'
        d.mkdir(parents=True, exist_ok=True)
        return d

    def art(self):
        return json.loads((self.pack / 'art.json').read_text())

    def test_export_then_import_roundtrip(self):
        idle, one, two = make_frame('111111'), make_frame('222222'), make_frame('333333')
        write_pack(self.pack, idle, [one, two])
        pixels.export_pack(self.pack)
        self.assertEqual(sorted(p.name for p in self.grid().iterdir()), ['1.txt', '2.txt', 'idle.txt'])
        (self.pack / 'art.json').unlink()
        pixels.import_pack(self.pack)
        self.assertEqual(self.art()['idle'], idle)
        self.assertEqual(self.art()['work'], [one, two])

    def test_import_missing_idle_uses_first(self):
        for n, c in [(1, 'aaaaaa'), (2, 'bbbbbb')]:
            (self.grid() / f'{n}.txt').write_text(pixels.frame_to_grid(make_frame(c)))
        pixels.import_pack(self.pack)
        self.assertEqual(self.art()['idle'], self.art()['work'][0])

    def test_import_max_five_numeric_order(self):
        for n in [10, 2, 1, 3, 4, 5, 6]:
            (self.grid() / f'{n}.txt').write_text(pixels.frame_to_grid(make_frame(f'{n:06d}')))
        pixels.import_pack(self.pack)
        self.assertEqual([f[10][8] for f in self.art()['work']], ['000001', '000002', '000003', '000004', '000005'])

    def test_import_no_grids_raises(self):
        self.grid()
        with self.assertRaises(ValueError) as cm:
            pixels.import_pack(self.pack)
        self.assertIn('grid', str(cm.exception))

    def test_preview_reads_source_folder(self):
        write_pack(self.pack, make_frame(), [make_frame()])
        without = Image.open(pixels.preview_pack(self.pack))
        (self.pack / 'source').mkdir()
        Image.new('RGBA', (100, 50), (0, 0, 255, 255)).save(self.pack / 'source' / 'pic.png')
        with_source = Image.open(pixels.preview_pack(self.pack))
        self.assertGreater(with_source.height, without.height)
        self.assertGreaterEqual(with_source.width, 32 * 12)

    def test_gif_written(self):
        write_pack(self.pack, make_frame(), [make_frame('111111'), make_frame('222222'), make_frame('333333')], frame_ms=110)
        out = pixels.gif_pack(self.pack)
        self.assertEqual(out, self.pack / 'preview.gif')
        with Image.open(out) as gif:
            self.assertEqual(gif.n_frames, 3)
            self.assertEqual(gif.info['duration'], 110)

    def test_gif_default_speed(self):
        write_pack(self.pack, make_frame(), [make_frame('111111'), make_frame('222222')])
        with Image.open(pixels.gif_pack(self.pack)) as gif:
            self.assertEqual(gif.info['duration'], 250)


if __name__ == '__main__':
    unittest.main()


class CheckTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = Path(self.tmp.name) / 'bunny'
        write_pack(self.pack, make_frame(), [make_frame(), make_frame('222222')])
        (self.pack / 'lines.json').write_text(json.dumps({'en': {'spinner': ['a'], 'idle': ['b'], 'ending': ['c']}}))

    def tearDown(self):
        self.tmp.cleanup()

    def meta(self, **over):
        meta = json.loads((self.pack / 'dotchi.json').read_text())
        meta.update(over)
        (self.pack / 'dotchi.json').write_text(json.dumps(meta))

    def test_valid_pack_passes(self):
        self.assertEqual(pixels.check_pack(self.pack), [])

    def test_problems_found(self):
        self.meta(frameMs=50, id='Bad Id')
        (self.pack / 'lines.json').write_text(json.dumps({'en': {'spinner': ['a'], 'idle': ['b']}}))
        problems = ' '.join(pixels.check_pack(self.pack))
        for word in ('frameMs', 'id', 'ending'):
            self.assertIn(word, problems)

    def test_too_many_frames(self):
        write_pack(self.pack, make_frame(), [make_frame()] * 6)
        self.assertTrue(any('work' in p for p in pixels.check_pack(self.pack)))

    def test_cli_exit_code(self):
        self.assertEqual(pixels.main(['check', str(self.pack)]), 0)
        self.meta(format=2)
        self.assertEqual(pixels.main(['check', str(self.pack)]), 1)

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

    def test_icon(self):
        self.meta(icon='🌰')
        self.assertEqual(pixels.check_pack(self.pack), [])
        for bad in ('', 'a b', 'x' * 9, 3):
            self.meta(icon=bad)
            self.assertTrue(any('icon' in p for p in pixels.check_pack(self.pack)), bad)

    def test_line_is_reserved(self):
        self.meta(id='line')
        self.assertTrue(any('id' in p for p in pixels.check_pack(self.pack)))

    def test_too_many_frames(self):
        write_pack(self.pack, make_frame(), [make_frame()] * 6)
        self.assertTrue(any('work' in p for p in pixels.check_pack(self.pack)))

    def test_cli_exit_code(self):
        self.assertEqual(pixels.main(['check', str(self.pack)]), 0)
        self.meta(format=2)
        self.assertEqual(pixels.main(['check', str(self.pack)]), 1)


def write_stage_pack(pack):
    """1단계 움직임 2컷 + 2·3단계 (색이 다 다르게)"""
    stages = {
        '2': {'idle': make_frame('222200'), 'work': [make_frame('222201'), make_frame('222202')]},
        '3': {'idle': make_frame('333300'), 'work': [make_frame('333301'), make_frame('333302')]},
    }
    write_pack(pack, make_frame('111100'), [make_frame('111101'), make_frame('111102')])
    art = json.loads((pack / 'art.json').read_text())
    art['stages'] = stages
    (pack / 'art.json').write_text(json.dumps(art))
    (pack / 'lines.json').write_text(json.dumps({'en': {'spinner': ['a'], 'idle': ['b'], 'ending': ['c']}}))
    return stages


class StageTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = Path(self.tmp.name) / 'bunny'

    def tearDown(self):
        self.tmp.cleanup()

    def art(self):
        return json.loads((self.pack / 'art.json').read_text())

    def test_stage_grids_round_trip(self):
        stages = write_stage_pack(self.pack)
        d = pixels.export_pack(self.pack)
        names = sorted(p.name for p in d.glob('*.txt'))
        self.assertEqual(names, ['1.txt', '2.txt', 'idle.txt', 's2-1.txt', 's2-2.txt', 's2-idle.txt', 's3-1.txt', 's3-2.txt', 's3-idle.txt'])
        (self.pack / 'art.json').unlink()
        pixels.import_pack(self.pack)
        self.assertEqual(self.art()['stages'], stages)

    def test_import_without_stage_grids_has_no_stages(self):
        write_pack(self.pack, make_frame(), [make_frame('222222')])
        pixels.export_pack(self.pack)
        pixels.import_pack(self.pack)
        self.assertNotIn('stages', self.art())

    def test_stage_idle_missing_uses_first(self):
        write_pack(self.pack, make_frame(), [make_frame('222222')])
        d = pixels.export_pack(self.pack)
        (d / 's3-1.txt').write_text(pixels.frame_to_grid(make_frame('333333')))
        pixels.import_pack(self.pack)
        self.assertEqual(self.art()['stages'], {'3': {'idle': make_frame('333333'), 'work': [make_frame('333333')]}})

    def test_stage_overlay_stacks(self):
        write_pack(self.pack, make_frame('111111'), [make_frame('111112'), make_frame('111113')])
        pixels.export_pack(self.pack)
        two = [[None] * 32 for _ in range(32)]
        two[0][0] = 'aaaaaa'
        three = [[None] * 32 for _ in range(32)]
        three[0][1] = 'bbbbbb'
        three[11][9] = 'cccccc'
        over2, over3 = Path(self.tmp.name) / 'o2.txt', Path(self.tmp.name) / 'o3.txt'
        over2.write_text(pixels.frame_to_grid(two))
        over3.write_text(pixels.frame_to_grid(three))
        self.assertEqual(pixels.main(['stage', str(self.pack), '2', str(over2)]), 0)
        self.assertEqual(pixels.main(['stage', str(self.pack), '3', str(over3)]), 0)
        pixels.import_pack(self.pack)
        art = self.art()
        for stage, extra in (('2', {(0, 0): 'aaaaaa'}), ('3', {(0, 0): 'aaaaaa', (0, 1): 'bbbbbb', (11, 9): 'cccccc'})):
            frames = [art['stages'][stage]['idle'], *art['stages'][stage]['work']]
            self.assertEqual(len(frames), 3)
            for base, frame in zip([art['idle'], *art['work']], frames):
                for y in range(32):
                    for x in range(32):
                        self.assertEqual(frame[y][x], extra.get((y, x), base[y][x]), (stage, y, x))

    def test_stage_overlay_bad_stage(self):
        write_pack(self.pack, make_frame(), [make_frame()])
        pixels.export_pack(self.pack)
        over = Path(self.tmp.name) / 'o.txt'
        over.write_text(pixels.frame_to_grid(make_frame()))
        self.assertEqual(pixels.main(['stage', str(self.pack), '4', str(over)]), 1)

    def test_check_rejects_bad_stages(self):
        write_stage_pack(self.pack)
        self.assertEqual(pixels.check_pack(self.pack), [])
        art = self.art()
        for bad in ({'4': art['stages']['2']}, [art['stages']['2']], {'2': {'idle': make_frame(), 'work': [make_frame()] * 6}}):
            art['stages'] = bad
            (self.pack / 'art.json').write_text(json.dumps(art))
            self.assertTrue(any('stages' in p for p in pixels.check_pack(self.pack)), bad)

    def test_preview_and_gif_with_stages(self):
        write_stage_pack(self.pack)
        self.assertTrue(pixels.preview_pack(self.pack).exists())
        gif = pixels.gif_pack(self.pack)
        with Image.open(gif) as img:
            self.assertEqual(img.n_frames, 3 * 2 * 2)

    def test_reserved_ids(self):
        write_stage_pack(self.pack)
        meta = json.loads((self.pack / 'dotchi.json').read_text())
        for word in ('grow', 'album', 'evolve'):
            meta['id'] = word
            (self.pack / 'dotchi.json').write_text(json.dumps(meta))
            self.assertTrue(any('id' in p for p in pixels.check_pack(self.pack)), word)


class FollowTest(unittest.TestCase):
    """덧그림은 컷마다 그 자리 그림이 움직인 만큼 따라간다"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = Path(self.tmp.name) / 'bunny'

    def tearDown(self):
        self.tmp.cleanup()

    def test_overlay_follows_a_bounce(self):
        idle = make_frame('111111')
        down = [[None] * 32] + [row[:] for row in idle[:-1]]
        write_pack(self.pack, idle, [idle, down])
        pixels.export_pack(self.pack)
        hat = [[None] * 32 for _ in range(32)]
        hat[9][12] = 'aaaaaa'
        over = Path(self.tmp.name) / 'o.txt'
        over.write_text(pixels.frame_to_grid(hat))
        pixels.stage_pack(self.pack, '2', over)
        pixels.import_pack(self.pack)
        two = json.loads((self.pack / 'art.json').read_text())['stages']['2']
        self.assertEqual(two['idle'][9][12], 'aaaaaa')
        self.assertEqual(two['work'][0][9][12], 'aaaaaa')
        self.assertEqual(two['work'][1][10][12], 'aaaaaa')
        self.assertEqual(two['work'][1][9][12], None)


class WebpTest(unittest.TestCase):
    """사이트 빌드가 쓰는 움직이는 WebP: 단계마다 쉴 때·일할 때, 자라는 모습"""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = Path(self.tmp.name) / 'bunny'
        self.out = Path(self.tmp.name) / 'out'

    def tearDown(self):
        self.tmp.cleanup()

    def frames(self, path):
        with Image.open(path) as img:
            return img.format, img.size, getattr(img, 'n_frames', 1), img.mode

    def test_stages_and_growth(self):
        write_stage_pack(self.pack)
        made = pixels.webp_pack(self.pack, self.out)
        names = sorted(p.name for p in made)
        self.assertEqual(names, ['grow.webp', 'stage1-idle.webp', 'stage1-work.webp', 'stage2-idle.webp',
                                 'stage2-work.webp', 'stage3-idle.webp', 'stage3-work.webp'])
        fmt, size, n, mode = self.frames(self.out / 'stage2-work.webp')
        self.assertEqual((fmt, size, n), ('WEBP', (256, 256), 2))
        self.assertEqual(self.frames(self.out / 'stage1-idle.webp')[2], 1)
        self.assertEqual(self.frames(self.out / 'grow.webp')[2], 3 * 2 * 2)
        with Image.open(self.out / 'stage1-idle.webp') as img:
            rgba = img.convert('RGBA')
            self.assertEqual(rgba.getpixel((0, 0))[3], 0)
            self.assertEqual(rgba.getpixel((8 * 12 + 3, 8 * 12 + 3))[:3], (255, 255, 255))

    def test_without_stages_grow_is_the_work_loop(self):
        write_pack(self.pack, make_frame(), [make_frame('222222'), make_frame('333333')])
        made = pixels.webp_pack(self.pack, self.out)
        self.assertEqual(sorted(p.name for p in made), ['grow.webp', 'stage1-idle.webp', 'stage1-work.webp'])
        self.assertEqual(self.frames(self.out / 'grow.webp')[2], 2)

    def test_cli(self):
        write_pack(self.pack, make_frame(), [make_frame('222222')])
        self.assertEqual(pixels.main(['webp', str(self.pack), str(self.out)]), 0)
        self.assertTrue((self.out / 'grow.webp').exists())

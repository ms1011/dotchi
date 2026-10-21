"""영상처리 변환기 테스트. tools/.venv/bin/python -m unittest tools/test_png2dots.py"""

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

import png2dots  # noqa: E402

TOOLS = Path(__file__).resolve().parent


def canvas(h, w, color=(255, 255, 255), alpha=255):
    img = np.zeros((h, w, 4), np.uint8)
    img[:, :, :3] = color[::-1]  # RGB → OpenCV BGR
    img[:, :, 3] = alpha
    return img


def disc(img, center, radius, color, alpha=255):
    cv2.circle(img, center, radius, (*color[::-1], alpha), -1)
    return img


def bunny():
    """외곽선 있고 살짝 흐린 토끼 일러스트 (귀 사이가 세 면이 막힌 배경)"""
    from PIL import Image, ImageDraw, ImageFilter

    img = Image.new('RGB', (600, 700), (250, 250, 245))
    d = ImageDraw.Draw(img)
    for left in (200, 330):
        d.rounded_rectangle([left, 40, left + 70, 330], radius=35, fill=(246, 231, 176), outline=(60, 50, 40), width=8)
        d.rounded_rectangle([left + 22, 90, left + 48, 290], radius=13, fill=(244, 166, 184))
    d.ellipse([110, 260, 490, 620], fill=(246, 231, 176), outline=(60, 50, 40), width=8)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    rgb = np.array(img)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGRA)


def line_art(gap_degrees=0):
    """흰 배경 위 흰 몸 + 검은 손그림 외곽선 (외곽선이 gap_degrees만큼 끊김) + 눈"""
    img = canvas(600, 600)
    half = gap_degrees / 2
    cv2.ellipse(img, (300, 320), (230, 230), 0, half, 360 - half, (0, 0, 0, 255), 10)
    cv2.circle(img, (230, 300), 12, (0, 0, 0, 255), -1)
    cv2.circle(img, (370, 300), 12, (0, 0, 0, 255), -1)
    return img


def is_dark(c):
    return c is not None and sum(int(c[i:i + 2], 16) for i in (0, 2, 4)) < 150


def opaque(frame):
    return [(y, x) for y, row in enumerate(frame) for x, c in enumerate(row) if c is not None]


def neighbors(frame, y, x, diagonal=False):
    steps = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if diagonal:
        steps += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    for dy, dx in steps:
        ny, nx = y + dy, x + dx
        yield frame[ny][nx] if 0 <= ny < 32 and 0 <= nx < 32 else None


class BackgroundTest(unittest.TestCase):
    def test_alpha_mask_used(self):
        img = disc(canvas(100, 100, alpha=0), (50, 50), 30, (255, 0, 0))
        mask = png2dots.remove_background(img)
        self.assertTrue((mask == (img[:, :, 3] >= 128)).all())

    def test_white_background_removed(self):
        img = disc(canvas(200, 200), (100, 100), 60, (220, 40, 40))
        frame = png2dots.convert_image(img)
        for y, x in [(0, 0), (0, 31), (31, 0), (31, 31)]:
            self.assertIsNone(frame[y][x])
        self.assertGreater(len(opaque(frame)), 300)

    def test_gradient_background_removed(self):
        img = canvas(200, 200)
        for y in range(200):
            t = y / 199
            img[y, :, :3] = (np.array([255, 220, 200]) * (1 - t) + np.array([120, 60, 40]) * t).astype(np.uint8)
        disc(img, (100, 100), 60, (250, 160, 30))
        frame = png2dots.convert_image(img)
        for y, x in [(0, 0), (0, 31), (31, 0), (31, 31)]:
            self.assertIsNone(frame[y][x])
        self.assertIsNotNone(frame[16][16])

    def test_gap_between_ears_removed(self):
        img = bunny()
        mask = png2dots.remove_background(img)
        self.assertFalse(mask[150, 300])  # 두 귀 사이
        self.assertTrue(mask[150, 235])  # 왼쪽 귀
        self.assertTrue(mask[450, 300])  # 얼굴

    def test_white_body_with_open_outline_kept(self):
        mask = png2dots.remove_background(line_art(gap_degrees=6))
        self.assertTrue(mask[320, 300])  # 흰 몸 가운데
        self.assertFalse(mask[5, 5])

    def test_inner_white_kept(self):
        img = disc(canvas(200, 200), (100, 100), 80, (30, 40, 140))
        disc(img, (100, 100), 14, (255, 255, 255))
        frame = png2dots.convert_image(img)
        whites = [c for row in frame for c in row if c is not None and all(int(c[i:i + 2], 16) > 200 for i in (0, 2, 4))]
        self.assertTrue(whites)


class PixelArtTest(unittest.TestCase):
    def test_palette_limited(self):
        img = canvas(200, 200, alpha=0)
        hsv = np.zeros((200, 200, 3), np.uint8)
        hsv[:, :, 0] = np.linspace(0, 179, 200, dtype=np.uint8)[None, :]
        hsv[:, :, 1:] = 255
        bgr = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        mask = np.zeros((200, 200), np.uint8)
        cv2.circle(mask, (100, 100), 90, 255, -1)
        img[:, :, :3] = bgr
        img[:, :, 3] = mask
        frame = png2dots.convert_image(img, colors=8)
        colors = {c for row in frame for c in row if c is not None}
        self.assertLessEqual(len(colors), 8 + 1)  # 팔레트 8색 + 외곽선 1색

    def test_outline_present(self):
        img = disc(canvas(200, 200, alpha=0), (100, 100), 90, (240, 200, 120))
        frame = png2dots.convert_image(img)
        edge = {frame[y][x] for y, x in opaque(frame) if None in neighbors(frame, y, x)}
        self.assertEqual(len(edge), 1)
        color = edge.pop()
        r, g, b = (int(color[i:i + 2], 16) for i in (0, 2, 4))
        self.assertLess(r + g + b, 240 + 200 + 120)

    def test_line_art_outline_not_doubled(self):
        frame = png2dots.convert_image(line_art())
        row = frame[16]
        first = next(i for i, c in enumerate(row) if c is not None)
        run = 0
        for c in row[first:]:
            if not is_dark(c):
                break
            run += 1
        self.assertEqual(run, 1)
        self.assertFalse(is_dark(row[first + 1]))

    def test_isolated_pixel_removed(self):
        rng = np.random.default_rng(1)
        img = disc(canvas(200, 200, alpha=0), (100, 100), 90, (120, 180, 230))
        ys, xs = np.nonzero(img[:, :, 3])
        pick = rng.choice(len(ys), 400, replace=False)
        img[ys[pick], xs[pick], :3] = rng.integers(0, 256, (400, 3), dtype=np.uint8)
        frame = png2dots.convert_image(img)
        for y, x in opaque(frame):
            self.assertIn(frame[y][x], list(neighbors(frame, y, x, diagonal=True)), (y, x))

    def test_fits_32_bottom_aligned(self):
        img = canvas(120, 300, alpha=0)
        cv2.ellipse(img, (150, 60), (140, 50), 0, 0, 360, (40, 120, 200, 255), -1)
        frame = png2dots.convert_image(img)
        self.assertEqual(len(frame), 32)
        self.assertTrue(all(len(row) == 32 for row in frame))
        self.assertTrue(any(c is not None for c in frame[31]))
        columns = [x for _, x in opaque(frame)]
        self.assertLessEqual(abs(min(columns) - (31 - max(columns))), 1)


class CharacterFolderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pack = Path(self.tmp.name) / 'bunny'
        self.folder = self.pack / 'source'
        self.folder.mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def save(self, name, color=(200, 80, 80)):
        cv2.imwrite(str(self.folder / name), disc(canvas(100, 100, alpha=0), (50, 50), 40, color))

    def test_single_png_any_name(self):
        self.save('bunny.png')
        art = png2dots.convert_pack(self.pack)
        self.assertEqual(len(art['work']), 1)
        self.assertEqual(art['idle'], art['work'][0])

    def test_numbered_frames_and_idle(self):
        self.save('idle.png', (10, 10, 200))
        self.save('2.png', (200, 10, 10))
        self.save('1.png', (10, 200, 10))
        art = png2dots.convert_pack(self.pack)
        self.assertEqual(len(art['work']), 2)
        self.assertNotEqual(art['idle'], art['work'][0])

    def test_webp_and_jpg_accepted(self):
        self.save('1.webp')
        cv2.imwrite(str(self.folder / 'idle.jpg'), disc(canvas(100, 100), (50, 50), 40, (10, 10, 200))[:, :, :3])
        art = png2dots.convert_pack(self.pack)
        self.assertEqual(len(art['work']), 1)
        self.assertNotEqual(art['idle'], art['work'][0])

    def test_frames_keep_motion_and_share_palette(self):
        rest = disc(canvas(400, 300, alpha=0), (150, 300), 80, (230, 120, 60))
        jump = disc(canvas(400, 300, alpha=0), (150, 240), 80, (230, 120, 60))
        cv2.circle(jump, (150, 240), 30, (40, 160, 220, 255), -1)
        cv2.imwrite(str(self.folder / '1.png'), rest)
        cv2.imwrite(str(self.folder / '2.png'), jump)
        art = png2dots.convert_pack(self.pack, colors=4)
        bottom = [max(y for y, _ in opaque(f)) for f in art['work']]
        self.assertLess(bottom[1], bottom[0])  # 뛴 컷은 위에 있다
        rest_colors = {c for row in art['work'][0] for c in row if c is not None}
        jump_colors = {c for row in art['work'][1] for c in row if c is not None}
        self.assertTrue(rest_colors <= jump_colors)  # 같은 팔레트: 쉬는 컷의 색이 뛴 컷에도 그대로

    def test_no_png_exits_1(self):
        result = subprocess.run(
            [sys.executable, str(TOOLS / 'png2dots.py'), str(self.pack)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn('그림 파일(PNG·WebP·JPG)이 없어요', result.stderr)

    def test_cli_writes_art_and_grids(self):
        self.save('1.png')
        result = subprocess.run(
            [sys.executable, str(TOOLS / 'png2dots.py'), str(self.pack)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.pack / 'art.json').exists())
        self.assertTrue((self.pack / 'grid' / '1.txt').exists())


if __name__ == '__main__':
    unittest.main()

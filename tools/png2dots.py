"""영상처리 변환기: 그림(PNG)을 32×32 픽셀 아트로 바꾼다.

사용법 (tools/setup.sh 를 먼저 한 번 실행):
  ~/.claude/dotchi/venv/bin/python tools/png2dots.py <pack> [--colors N]

<pack>/source/ 의 그림(PNG·WebP·JPG)을 읽어 <pack>/art.json 을 쓰고, Claude가 고칠 수 있게 <pack>/grid/*.txt 로도 내보낸다.
순서: 배경 분리 → 자르기 → 다듬기 → 칸마다 대표색으로 축소 → 색 줄이기 → 튀는 점 지우기 → 외곽선 → 배치.
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pixels  # noqa: E402

SIZE = pixels.SIZE
CONTENT = SIZE - 2  # 외곽선 1픽셀씩 자리
EIGHT = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
FOUR = [(-1, 0), (1, 0), (0, -1), (0, 1)]


def load_bgra(path):
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f'{path.name}: 그림을 읽지 못했어요')
    if img.dtype == np.uint16:
        img = (img >> 8).astype(np.uint8)
    if img.ndim == 2:
        return cv2.cvtColor(img, cv2.COLOR_GRAY2BGRA)
    if img.shape[2] == 3:
        return cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    return img


def to_lab(bgr):
    """L 0~100, a/b 대략 -128~127"""
    return cv2.cvtColor(bgr.astype(np.float32) / 255.0, cv2.COLOR_BGR2Lab)


def fill_holes(mask):
    """테두리와 이어지지 않은 배경(눈 흰자 같은 구멍)은 전경으로 되돌린다."""
    background = (~mask).astype(np.uint8)
    count, labels = cv2.connectedComponents(background, connectivity=4)
    border = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])))
    holes = (labels > 0) & ~np.isin(labels, list(border))
    return mask | holes


def flood_background(bgr):
    """테두리 대표색과 비슷하고 테두리와 이어진 영역을 배경으로 본다."""
    lab = to_lab(bgr)
    border = np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    reference = np.median(border, axis=0)
    similar = (np.linalg.norm(lab - reference, axis=2) <= 12).astype(np.uint8)
    count, labels = cv2.connectedComponents(similar, connectivity=4)
    touching = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    return ~np.isin(labels, list(touching)) | (similar == 0)


def line_art_region(bgr):
    """검은 손그림 선을 이어 붙여(닫힘 연산) 선과 그 안쪽을 전경으로 본다. 흰 몸 캐릭터용."""
    h, w = bgr.shape[:2]
    lines = (to_lab(bgr)[:, :, 0] < 45).astype(np.uint8)
    size = max(3, round(0.05 * max(h, w))) | 1
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))
    closed = cv2.morphologyEx(lines, cv2.MORPH_CLOSE, kernel).astype(bool)
    return fill_holes(closed)


def clean_mask(mask):
    kernel = np.ones((3, 3), np.uint8)
    m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    if count <= 1:
        return m.astype(bool)
    areas = stats[1:, cv2.CC_STAT_AREA]
    keep = [i + 1 for i, area in enumerate(areas) if area >= 0.05 * areas.max()]
    return np.isin(labels, keep)


def remove_background(rgba):
    """전경 마스크(bool). 이미 투명 배경이면 알파를 그대로 쓴다."""
    alpha = rgba[:, :, 3]
    if (alpha < 128).mean() >= 0.02:
        return alpha >= 128
    bgr = np.ascontiguousarray(rgba[:, :, :3])
    h, w = alpha.shape
    inset_y, inset_x = max(1, round(h * 0.03)), max(1, round(w * 0.03))
    rect = (inset_x, inset_y, w - 2 * inset_x, h - 2 * inset_y)
    gc = np.zeros((h, w), np.uint8)
    cv2.setRNGSeed(0)
    cv2.grabCut(bgr, gc, rect, np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64), 5, cv2.GC_INIT_WITH_RECT)
    mask = (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)
    flood = flood_background(bgr)
    if not 0.02 <= mask.mean() <= 0.98:
        mask = flood
    elif 0.02 <= flood.mean():
        # GrabCut은 귀 사이처럼 세 면이 막힌 배경을 전경으로 보기 쉽다: 테두리와 이어진 배경색은 뺀다
        mask &= flood
    enclosed = line_art_region(bgr)
    if 0.02 <= enclosed.mean() <= 0.98:
        # 몸이 배경과 같은 흰색이면 위에서 지워진다: 외곽선 안쪽은 되살린다
        mask |= enclosed
    return clean_mask(fill_holes(mask))


def downscale(bgr, mask):
    """칸마다 마스크 비율 ≥ 0.5면 불투명, 색은 마스크 안 픽셀의 중앙값."""
    h, w = mask.shape
    scale = CONTENT / max(h, w)
    th, tw = max(1, round(h * scale)), max(1, round(w * scale))
    colors = np.zeros((th, tw, 3), np.uint8)
    solid = np.zeros((th, tw), bool)
    for j in range(th):
        y0 = j * h // th
        y1 = max(y0 + 1, (j + 1) * h // th)
        for i in range(tw):
            x0 = i * w // tw
            x1 = max(x0 + 1, (i + 1) * w // tw)
            block = mask[y0:y1, x0:x1]
            if block.mean() >= 0.5:
                solid[j, i] = True
                colors[j, i] = np.median(bgr[y0:y1, x0:x1][block], axis=0)
    return colors, solid


def quantize(smalls, k):
    """여러 컷의 (색, 불투명) 쌍을 한 팔레트로 줄인다: 컷마다 색이 깜빡이지 않게."""
    points = np.concatenate([colors[solid] for colors, solid in smalls]).reshape(-1, 1, 3)
    unique = len(np.unique(points.reshape(-1, 3), axis=0))
    k = max(1, min(k, unique))
    lab = to_lab(points).reshape(-1, 3)
    cv2.setRNGSeed(0)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.1)
    _, labels, centers = cv2.kmeans(lab, k, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
    palette = np.clip(cv2.cvtColor(centers.reshape(-1, 1, 3), cv2.COLOR_Lab2BGR) * 255, 0, 255).round()
    palette = palette.astype(np.uint8).reshape(-1, 3)
    labels = labels.ravel()
    out, start = [], 0
    for colors, solid in smalls:
        count = int(solid.sum())
        quantized = colors.copy()
        quantized[solid] = palette[labels[start:start + count]]
        out.append(quantized)
        start += count
    return out, centers


def hex_of(bgr):
    b, g, r = (int(v) for v in bgr)
    return f'{r:02x}{g:02x}{b:02x}'


def is_dark(color):
    r, g, b = (int(color[i:i + 2], 16) for i in (0, 2, 4))
    return 0.299 * r + 0.587 * g + 0.114 * b < 80


def remove_strays(grid):
    """같은 색 이웃이 하나도 없는 칸은 이웃 최빈색으로, 2칸 이하 고립 덩어리는 지운다."""
    h, w = len(grid), len(grid[0])
    for _ in range(3):
        changed = False
        for y in range(h):
            for x in range(w):
                c = grid[y][x]
                if c is None:
                    continue
                around = [grid[y + dy][x + dx] for dy, dx in EIGHT if 0 <= y + dy < h and 0 <= x + dx < w]
                filled = [n for n in around if n is not None]
                if c in filled:
                    continue
                grid[y][x] = Counter(filled).most_common(1)[0][0] if filled else None
                changed = True
        if not changed:
            break
    solid = np.array([[c is not None for c in row] for row in grid], np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(solid, connectivity=8)
    for label in range(1, count):
        if stats[label, cv2.CC_STAT_AREA] <= 2:
            for y, x in zip(*np.nonzero(labels == label)):
                grid[y][x] = None
    return grid


def outline_color(centers):
    darkest = centers[np.argmin(centers[:, 0])].copy()
    if darkest[0] > 25:
        darkest[0] *= 0.7
    bgr = np.clip(cv2.cvtColor(darkest.reshape(1, 1, 3).astype(np.float32), cv2.COLOR_Lab2BGR) * 255, 0, 255)
    return hex_of(bgr.round().astype(np.uint8).reshape(3))


def bounding_box(mask):
    ys, xs = np.nonzero(mask)
    if len(ys) == 0:
        raise ValueError('그림에서 캐릭터를 찾지 못했어요')
    return ys.min(), ys.max() + 1, xs.min(), xs.max() + 1


def shared_box(masks):
    """크기가 같은 컷들은 한 상자로 잘라야 움직임(폴짝, 귀)이 남는다."""
    boxes = [bounding_box(m) for m in masks]
    if len({m.shape for m in masks}) != 1:
        return boxes
    y0, y1 = min(b[0] for b in boxes), max(b[1] for b in boxes)
    x0, x1 = min(b[2] for b in boxes), max(b[3] for b in boxes)
    return [(y0, y1, x0, x1)] * len(masks)


def place(small, solid):
    th, tw = solid.shape
    top, left = SIZE - 1 - th, 1 + (CONTENT - tw) // 2
    grid = [[None] * SIZE for _ in range(SIZE)]
    for j in range(th):
        for i in range(tw):
            if solid[j, i]:
                grid[top + j][left + i] = hex_of(small[j, i])
    return remove_strays(grid)


def add_outline(grid, edge):
    def touching(y, x):
        return [
            grid[y + dy][x + dx]
            for dy, dx in FOUR
            if 0 <= y + dy < SIZE and 0 <= x + dx < SIZE and grid[y + dy][x + dx] is not None
        ]

    # 원래 그림에 검은 선이 있으면 그 선이 이미 외곽선이다: 두 겹으로 두르지 않는다
    ring = [
        (y, x)
        for y in range(SIZE)
        for x in range(SIZE)
        if grid[y][x] is None and (around := touching(y, x)) and not all(is_dark(c) for c in around)
    ]
    for y, x in ring:
        grid[y][x] = edge
    return grid


def pixelate_many(images, masks, colors=12):
    smalls = []
    for rgba, mask, (y0, y1, x0, x1) in zip(images, masks, shared_box(masks)):
        bgr = np.ascontiguousarray(rgba[y0:y1, x0:x1, :3])
        if min(bgr.shape[:2]) >= 64:
            bgr = cv2.bilateralFilter(bgr, 9, 75, 75)
        small, solid = downscale(bgr, mask[y0:y1, x0:x1])
        if not solid.any():
            raise ValueError('그림에서 캐릭터를 찾지 못했어요')
        smalls.append((small, solid))
    quantized, centers = quantize(smalls, colors)
    edge = outline_color(centers)
    return [add_outline(place(q, solid), edge) for q, (_, solid) in zip(quantized, smalls)]


def pixelate(rgba, mask, colors=12):
    return pixelate_many([rgba], [mask], colors)[0]


def convert_image(rgba, colors=12):
    return pixelate(rgba, remove_background(rgba), colors)


def convert_pack(pack, colors=12):
    """<pack>/source/ 의 그림 → art 사전. 번호 붙은 그림은 컷, idle.* 는 멈춘 그림, 아니면 아무 그림 한 장"""
    pack = Path(pack)
    pictures = pixels.originals(pack)
    frames = pixels.numbered(pictures)[: pixels.MAX_FRAMES]
    idle_path = next((p for p in pictures if p.stem == 'idle'), None)
    others = [p for p in pictures if p not in frames and p != idle_path]
    if not frames and others:
        frames = others[:1]
    if not frames and idle_path is None:
        raise ValueError(f'{pack / "source"}: 그림 파일(PNG·WebP·JPG)이 없어요')
    paths = frames + ([idle_path] if idle_path is not None else [])
    images = [load_bgra(p) for p in paths]
    grids = pixelate_many(images, [remove_background(img) for img in images], colors)
    work = grids[: len(frames)]
    idle = grids[-1] if idle_path is not None else work[0]
    return {'width': SIZE, 'height': SIZE, 'idle': idle, 'work': work or [idle]}


def main(argv):
    parser = argparse.ArgumentParser(description='그림을 32×32 픽셀 아트로 (팩 폴더의 source/ → art.json, grid/)')
    parser.add_argument('pack')
    parser.add_argument('--colors', type=int, default=12)
    args = parser.parse_args(argv)
    pack = Path(args.pack).expanduser()
    try:
        art = convert_pack(pack, args.colors)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    print(pixels.save_art(pack, art['idle'], art['work']))
    print(pixels.export_pack(pack))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

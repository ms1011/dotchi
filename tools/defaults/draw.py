"""기본 캐릭터용 그리기 도구: 32×32 격자에 도형을 칠하고 외곽선을 자동으로 두른다"""

N = 32


def blank():
    return [[None] * N for _ in range(N)]


def ellipse(g, cy, cx, ry, rx, c):
    for y in range(N):
        for x in range(N):
            if ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2 <= 1.0:
                g[y][x] = c


def rect(g, y0, y1, x0, x1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if 0 <= y < N and 0 <= x < N:
                g[y][x] = c


def rrect(g, y0, y1, x0, x1, c, r=2):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            dy = max(y0 + r - y, y - (y1 - r), 0)
            dx = max(x0 + r - x, x - (x1 - r), 0)
            if dy * dy + dx * dx <= r * r:
                g[y][x] = c


def px(g, pts, c):
    for y, x in pts:
        if 0 <= y < N and 0 <= x < N:
            g[y][x] = c


def outline(g, c):
    ring = [(y, x) for y in range(N) for x in range(N) if g[y][x] is None and any(
        0 <= y + dy < N and 0 <= x + dx < N and g[y + dy][x + dx] is not None for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    px(g, ring, c)

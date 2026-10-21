"""거북이: 오른쪽을 보는 옆모습. 일할 때는 엄청 빠르게 달린다: 다리가 빠르게 번갈아, 머리가 앞으로, 뒤로 바람 선과 먼지"""
from draw import ellipse, blank, outline, px, rect, rrect

SHELL, PLATE, RIM, SKIN, SKIN2, EYE, PINK, OUT = '74c46b', '4f9d4f', 'b8e28a', 'c6eb8f', 'a8d672', '22281e', 'ff9fb2', '1f3020'
WIND, DUST = 'cfe3f0', 'c9b28e'

# 다리 네 개의 x 위치 (앞뒤로 움직이는 기준)
LEGS = (5, 10, 15, 19)


def turtle(run=None, lean=0, wind=None, dust=False):
    """run: 다리 자세 ('a'|'b', 없으면 서 있음), lean: 머리가 앞으로 나온 칸, wind: 바람 선 줄 위치들, dust: 뒷발 먼지"""
    g = blank()
    for i, x0 in enumerate(LEGS):
        if run is None:
            rrect(g, 24, 28, x0, x0 + 3, SKIN2, r=1)
        else:
            forward = (i % 2 == 0) == (run == 'a')     # 번갈아 앞으로 뻗은 다리는 들려서 짧다
            dx = 1 if forward else -1
            rrect(g, 24, 27 if forward else 28, x0 + dx, x0 + dx + 3, SKIN2, r=1)
    px(g, [(23, 1), (24, 2), (24, 1)], SKIN2)                        # 꼬리
    ellipse(g, 17, 12, 9, 11.5, SHELL)                               # 등껍질 (돔)
    for y in range(23, 32):                                          # 돔 아래 잘라내기
        for x in range(0, 32):
            if g[y][x] == SHELL:
                g[y][x] = None
    rect(g, 22, 23, 1, 23, RIM)                                      # 등껍질 테두리 띠
    for cy, cx in [(13, 7), (13, 17), (10, 12), (17, 12), (18, 5), (18, 19)]:
        ellipse(g, cy, cx, 1.8, 2.4, PLATE)                          # 무늬
    px(g, [(10, 6), (9, 7), (9, 8)], 'a6e09a')                       # 반짝임
    ellipse(g, 18.5, 25 + lean, 5, 5, SKIN)                          # 머리 (lean만큼 앞으로)
    rect(g, 23, 24, 22 + lean, 23 + lean, SKIN)                      # 목
    # 앞쪽을 보는 눈 (흰자 뒤, 눈동자 앞), 볼, 앞쪽으로 올라가는 웃는 입
    rect(g, 15, 17, 25 + lean, 26 + lean, 'ffffff'); rect(g, 15, 17, 27 + lean, 28 + lean, EYE)
    px(g, [(15, 27 + lean)], 'ffffff')
    rect(g, 19, 19, 25 + lean, 26 + lean, PINK)
    px(g, [(20, 27 + lean), (20, 28 + lean), (19, 29 + lean)], EYE)
    outline(g, OUT)
    # 외곽선 뒤에 그리는 효과: 등껍질 뒤 바람 선, 뒷발 먼지
    for y, x0, length in wind or []:
        for x in range(x0, x0 + length):
            if 0 <= x < 32 and g[y][x] is None:
                g[y][x] = WIND
    if dust:
        px(g, [(29, 1), (28, 2), (29, 3), (30, 0)], DUST)
    return g


IDLE = dict()
POSES = [
    dict(run='a', lean=1, wind=[(6, 0, 6), (8, 2, 5), (10, 0, 3), (25, 0, 2)], dust=True),
    dict(run='b', lean=1, wind=[(5, 1, 5), (7, 0, 7), (9, 0, 4), (26, 0, 2)]),
    dict(run='a', lean=1, wind=[(6, 1, 5), (8, 0, 6), (10, 1, 2), (25, 1, 2)], dust=True),
    dict(run='b', lean=1, wind=[(5, 0, 6), (7, 2, 5), (9, 1, 3), (26, 1, 1)]),
]
FRAME_MS = 110

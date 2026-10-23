"""호랑이(한국): 주황 털에 검은 줄무늬, 흰 주둥이와 볼. 움직임은 꼬리 흔들기, 앞발 들기, 눈 깜빡"""
from draw import blank, ellipse, outline, px, rect, rrect

ORANGE, WHITE, STRIPE, PINK, EYE, OUT = 'f08a24', 'fff4e2', '2e1d14', 'ff9fb2', '1e140f', '3a2216'


def tiger(tail=0, paw=0, blink=False):
    """tail: 꼬리 끝이 기우는 칸(-1 ~ 1), paw: 드는 앞발 높이(0 또는 -2), blink: 눈 감기"""
    g = blank()
    ellipse(g, 19, 27 + tail, 5, 1.6, ORANGE)                       # 꼬리 (몸 뒤 오른쪽)
    px(g, [(16, 27 + tail), (19, 27 + tail), (22, 27 + tail)], STRIPE)
    ellipse(g, 24, 15.5, 6.5, 8, ORANGE)                            # 몸
    ellipse(g, 25, 15.5, 4.5, 4, WHITE)                             # 배
    px(g, [(20, 8), (21, 8), (23, 8), (20, 23), (21, 23), (23, 23)], STRIPE)   # 몸 줄무늬
    rrect(g, 29, 30, 9, 12, ORANGE, r=1)                            # 뒷발
    rrect(g, 29, 30, 19, 22, ORANGE, r=1)
    rrect(g, 22 + paw, 24 + paw, 8, 11, WHITE, r=1)                 # 흰 앞발 (paw만큼 위로)
    ellipse(g, 4.5, 8.5, 2.5, 2.5, ORANGE); ellipse(g, 4.5, 22.5, 2.5, 2.5, ORANGE)   # 귀
    px(g, [(4, 8), (5, 8), (4, 23), (5, 23)], WHITE)
    ellipse(g, 12, 15.5, 7.5, 9.5, ORANGE)                          # 머리
    ellipse(g, 15, 15.5, 3, 5, WHITE)                               # 주둥이
    ellipse(g, 14, 8, 2, 2, WHITE); ellipse(g, 14, 23, 2, 2, WHITE) # 흰 볼
    rect(g, 5, 7, 15, 16, STRIPE)                                   # 이마 줄무늬 (王)
    px(g, [(6, 12), (7, 12), (6, 19), (7, 19)], STRIPE)
    px(g, [(10, 6), (11, 6), (12, 6), (10, 25), (11, 25), (12, 25)], STRIPE)   # 볼 줄무늬
    if blink:
        rect(g, 11, 11, 11, 12, EYE); rect(g, 11, 11, 19, 20, EYE)
    else:
        rect(g, 10, 11, 11, 12, EYE); rect(g, 10, 11, 19, 20, EYE)
        px(g, [(10, 11), (10, 19)], 'ffffff')
    px(g, [(13, 15), (13, 16)], PINK)                               # 코
    px(g, [(14, 14), (14, 17), (15, 15), (15, 16)], EYE)            # 웃는 입
    outline(g, OUT)
    return g


IDLE = dict()
POSES = [dict(tail=1), dict(tail=0, paw=-2), dict(tail=-1), dict(tail=0, blink=True)]
FRAME_MS = 220

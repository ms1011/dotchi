"""흰머리수리(미국): 흰 머리, 노란 부리, 갈색 몸과 날개, 흰 꼬리깃. 움직임은 날갯짓, 눈 깜빡"""
from draw import blank, ellipse, outline, px, rect, rrect

WHITE, BROWN, WING, BEAK, BEAK2, EYE, OUT = 'f7f5f0', '6b4226', '8a5a36', 'f5b82e', 'd48f12', '1e140f', '2a1a10'


def eagle(wing=0, blink=False):
    """wing: 날개가 올라가는 칸(0 ~ -3), blink: 눈 감기"""
    g = blank()
    rect(g, 28, 30, 13, 18, WHITE)                                  # 흰 꼬리깃
    ellipse(g, 22 + wing, 6.5, 6, 3, WING)                          # 날개
    ellipse(g, 22 + wing, 24.5, 6, 3, WING)
    ellipse(g, 23, 15.5, 6.5, 7, BROWN)                             # 몸
    px(g, [(30, 12), (30, 13), (30, 18), (30, 19)], BEAK)           # 발
    ellipse(g, 11, 15.5, 7.5, 8.5, WHITE)                           # 흰 머리
    if blink:
        rect(g, 10, 10, 11, 12, EYE); rect(g, 10, 10, 19, 20, EYE)
    else:
        rect(g, 8, 10, 11, 12, EYE); rect(g, 8, 10, 19, 20, EYE)    # 동그란 큰 눈
        px(g, [(8, 11), (8, 19)], 'ffffff')
    rrect(g, 12, 15, 14, 17, BEAK, r=1)                             # 부리
    px(g, [(16, 16), (16, 17), (15, 17)], BEAK2)                    # 굽은 부리 끝
    outline(g, OUT)
    return g


IDLE = dict()
POSES = [dict(), dict(wing=-2), dict(wing=-3), dict(wing=-1, blink=True)]
FRAME_MS = 180

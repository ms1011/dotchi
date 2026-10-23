"""시바견(일본): 갈색 털에 크림색 볼과 주둥이, 세모 귀, 말려 올라간 꼬리, 빨간 목도리. 움직임은 꼬리 흔들기, 귀 쫑긋, 눈 깜빡"""
from draw import blank, ellipse, outline, px, rect, rrect

FUR, CREAM, PINK, EYE, NOSE, RED, OUT = 'e8893a', 'fbe8cc', 'ffa8b8', '1e140f', '2b1d16', 'd9433b', '4a2a14'

# 뾰족한 세모 귀 (오른쪽은 31-x 대칭)
LEFT_EAR = [(1, 8), (2, 8), (2, 9), (3, 7), (3, 8), (3, 9), (4, 7), (4, 8), (4, 9), (4, 10),
            (5, 6), (5, 7), (5, 8), (5, 9), (5, 10), (6, 6), (6, 7), (6, 8), (6, 9), (6, 10), (6, 11)]


def shiba(tail=0, ear=0, blink=False):
    """tail: 꼬리가 기우는 칸(-1 ~ 1), ear: 귀가 올라가는 칸(0 또는 -1), blink: 눈 감기"""
    g = blank()
    ellipse(g, 19, 25 + tail, 3.5, 3.5, FUR)                        # 말린 꼬리
    ellipse(g, 19, 25 + tail, 1.5, 1.5, CREAM)
    ellipse(g, 24, 15.5, 6.5, 7.5, FUR)                             # 몸
    ellipse(g, 24.5, 15.5, 4.5, 3.5, CREAM)                         # 가슴
    rrect(g, 29, 30, 10, 13, CREAM, r=1)                            # 발
    rrect(g, 29, 30, 18, 21, CREAM, r=1)
    px(g, [(y + ear, x) for y, x in LEFT_EAR] + [(y + ear, 31 - x) for y, x in LEFT_EAR], FUR)   # 세모 귀
    px(g, [(4 + ear, 8), (5 + ear, 8), (5 + ear, 9), (4 + ear, 23), (5 + ear, 23), (5 + ear, 22)], PINK)
    ellipse(g, 12, 15.5, 7, 9.5, FUR)                               # 머리
    ellipse(g, 15, 15.5, 3.5, 6.5, CREAM)                           # 볼·주둥이 (흰 털)
    px(g, [(8, 11), (8, 20)], CREAM)                                # 눈썹 점
    if blink:
        rect(g, 11, 11, 11, 12, EYE); rect(g, 11, 11, 19, 20, EYE)
    else:
        rect(g, 10, 11, 11, 12, EYE); rect(g, 10, 11, 19, 20, EYE)
        px(g, [(10, 11), (10, 19)], 'ffffff')
    px(g, [(13, 15), (13, 16)], NOSE)                               # 코
    px(g, [(15, 14), (15, 17), (16, 15), (16, 16)], NOSE)           # 웃는 입 (코와 한 줄 띄워서)
    px(g, [(14, 9), (14, 22)], PINK)                                # 볼
    rect(g, 18, 18, 10, 21, RED)                                    # 목도리
    outline(g, OUT)
    return g


IDLE = dict()
POSES = [dict(tail=1), dict(tail=-1, ear=-1), dict(tail=1), dict(tail=-1, blink=True)]
FRAME_MS = 200

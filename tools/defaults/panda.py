"""판다(중국): 큰 흰 머리, 검은 귀와 눈 둘레, 앞발에 쥔 대나무. 움직임은 대나무 오물오물, 고개 끄덕, 눈 깜빡"""
from draw import blank, ellipse, outline, px, rect

WHITE, BLACK, PINK, BAMBOO, NODE, LEAF, OUT = 'f4f2ec', '2b2b30', 'ffb3c1', '8cc152', '5d8a2f', '6fae3a', '17171a'


def panda(chew=0, bob=0, blink=False):
    """chew: 대나무 높이(0 또는 -1), bob: 머리가 내려오는 칸(0 또는 1), blink: 눈 감기"""
    g = blank()
    ellipse(g, 24, 15.5, 6.5, 8.5, WHITE)                          # 몸
    ellipse(g, 28.5, 10.5, 2.5, 3, BLACK); ellipse(g, 28.5, 20.5, 2.5, 3, BLACK)   # 다리
    ellipse(g, 21.5, 9, 3, 2.5, BLACK); ellipse(g, 21.5, 22, 3, 2.5, BLACK)       # 앞발
    rect(g, 13 + chew, 27, 23, 24, BAMBOO)                          # 대나무
    px(g, [(17 + chew, 23), (17 + chew, 24), (22 + chew, 23), (22 + chew, 24)], NODE)
    px(g, [(12 + chew, 25), (11 + chew, 26), (12 + chew, 26)], LEAF)
    ellipse(g, 21.5, 22, 2, 2, BLACK)                               # 대나무 쥔 앞발 (앞에)
    ellipse(g, 4 + bob, 8.5, 2.5, 2.5, BLACK); ellipse(g, 4 + bob, 22.5, 2.5, 2.5, BLACK)   # 귀
    ellipse(g, 11 + bob, 15.5, 7, 9, WHITE)                         # 머리
    ellipse(g, 11 + bob, 11, 2, 1.5, BLACK); ellipse(g, 11 + bob, 20, 2, 1.5, BLACK)       # 눈 둘레
    if blink:
        px(g, [(10 + bob, 11), (10 + bob, 20)], BLACK)
    else:
        px(g, [(10 + bob, 11), (10 + bob, 20)], 'ffffff')           # 눈 반짝
    px(g, [(14 + bob, 15), (14 + bob, 16)], BLACK)                  # 코
    px(g, [(16 + bob, 14), (16 + bob, 17), (17 + bob, 15), (17 + bob, 16)], BLACK)   # 웃는 입 (코와 한 줄 띄워서)
    px(g, [(14 + bob, 9), (14 + bob, 22)], PINK)                    # 볼
    outline(g, OUT)
    return g


IDLE = dict()
POSES = [dict(), dict(chew=-1, bob=1), dict(), dict(chew=-1, bob=1, blink=True)]
FRAME_MS = 300

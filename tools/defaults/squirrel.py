"""다람쥐: 등 뒤로 말아 올린 큰 꼬리, 가슴 앞에 안은 도토리. 움직임은 꼬리 흔들기, 도토리 든 앞발, 발 번갈아 들기"""
from draw import blank, ellipse, outline, px, rect, rrect

FUR, TAIL, TAIL2, BELLY, PINK, EYE, CAP, NUT, OUT = 'd07d43', 'e39a55', 'f5c088', 'fbe7cc', 'ff9fb2', '241a14', '7a4a24', 'd9a05b', '3a2214'


def squirrel(tail=0, paw=0, lift=None):
    """tail: 꼬리 위쪽이 기우는 칸(-1.5 ~ 1.5), paw: 도토리 든 앞발 높이(0 또는 -1), lift: 드는 발('left'|'right')"""
    g = blank()
    ellipse(g, 11, 7.5 + tail, 9, 6.5, TAIL)          # 꼬리 위쪽 (흔들림)
    ellipse(g, 21, 8.5, 6, 5, TAIL)                   # 꼬리 아래쪽 (몸에 붙음)
    ellipse(g, 11, 8 + tail, 6, 3.5, TAIL2)           # 꼬리 안쪽 밝은 털
    ellipse(g, 22.5, 18, 7.5, 7.5, FUR)               # 몸
    ellipse(g, 24, 18, 5, 4.5, BELLY)                 # 배
    ellipse(g, 12, 18.5, 6.5, 7.5, FUR)               # 머리
    rrect(g, 4, 7, 12, 14, FUR, r=1); rrect(g, 4, 7, 23, 25, FUR, r=1)   # 귀
    px(g, [(3, 12), (3, 25)], FUR)                    # 귀 끝 털
    px(g, [(5, 13), (6, 13), (5, 24), (6, 24)], PINK)
    ellipse(g, 14.5, 18.5, 2.5, 4, BELLY)             # 주둥이
    for x0 in (14, 21):                               # 큰 눈 + 반짝임
        rect(g, 10, 12, x0, x0 + 1, EYE); px(g, [(10, x0)], 'ffffff')
    px(g, [(13, 18), (13, 19)], 'ff7f96')             # 코
    px(g, [(14, 18), (14, 19), (15, 17), (15, 20)], EYE)   # 입
    rect(g, 13, 14, 11, 12, PINK); rect(g, 13, 14, 25, 26, PINK)   # 볼
    # 가슴 앞에 안은 도토리 + 작은 앞발 (paw만큼 위로)
    rrect(g, 20 + paw, 21 + paw, 16, 21, CAP, r=1); px(g, [(19 + paw, 18), (19 + paw, 19)], CAP)
    rrect(g, 22 + paw, 25 + paw, 17, 20, NUT, r=1)
    px(g, [(23 + paw, 15), (23 + paw, 16), (23 + paw, 21), (23 + paw, 22)], BELLY)
    # 발: 든 발은 한 줄 위로 짧게
    rrect(g, 29 - (lift == 'left'), 30 - (lift == 'left'), 15, 18, FUR, r=1)
    rrect(g, 29 - (lift == 'right'), 30 - (lift == 'right'), 22, 25, FUR, r=1)
    outline(g, OUT)
    return g


IDLE = dict()
POSES = [dict(), dict(tail=1.5, paw=-1, lift='left'), dict(), dict(tail=-1.5, paw=-1, lift='right')]
FRAME_MS = 250

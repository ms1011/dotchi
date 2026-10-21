#!/bin/sh
# 영상처리 변환기용 가상 환경을 만든다. 기본 위치는 사용자 데이터 폴더(~/.claude/dotchi/venv)라서
# 플러그인을 업데이트해도 다시 설치하지 않는다. 이 폴더 밖에는 아무것도 설치하지 않는다.
set -e
TOOLS="$(cd "$(dirname "$0")" && pwd)"
VENV="${1:-$HOME/.claude/dotchi/venv}"
if [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c "import cv2, numpy, PIL" 2>/dev/null; then
  echo "$VENV"
  exit 0
fi
mkdir -p "$(dirname "$VENV")"
python3 -m venv "$VENV"
"$VENV/bin/pip" install --quiet -r "$TOOLS/requirements.lock"
echo "$VENV"

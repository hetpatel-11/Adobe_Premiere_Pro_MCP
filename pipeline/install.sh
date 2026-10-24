#!/bin/bash
# 파이프라인 의존성 설치 스크립트

echo "=== ffmpeg 설치 확인 ==="
# Homebrew PATH 자동 추가 (Apple Silicon / Intel 둘 다 대응)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v ffmpeg &> /dev/null; then
    echo "ffmpeg 설치 중..."
    if command -v brew &> /dev/null; then
        brew install ffmpeg
    else
        echo "Homebrew를 찾을 수 없습니다. pip으로 ffmpeg-python 대체 설치를 시도합니다..."
        pip3 install ffmpeg-python
        # 또는 conda 환경 확인
        if command -v conda &> /dev/null; then
            conda install -y ffmpeg
        else
            echo ""
            echo "[중요] ffmpeg 수동 설치 필요:"
            echo "  1. https://evermeet.cx/ffmpeg/ 에서 ffmpeg 다운로드"
            echo "  2. 다운받은 파일을 /usr/local/bin/ffmpeg 로 이동"
            echo "  3. chmod +x /usr/local/bin/ffmpeg 실행"
            echo "  4. 이 스크립트 다시 실행"
            echo ""
            echo "또는 Homebrew 설치 후 진행:"
            echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
        fi
    fi
else
    echo "ffmpeg 이미 설치됨: $(ffmpeg -version 2>&1 | head -1)"
fi

echo ""
echo "=== Python 패키지 설치 ==="
pip3 install -r requirements.txt

echo ""
echo "=== 설치 완료 ==="
echo "사용법: python3 run_pipeline.py --video /path/to/video.mp4"

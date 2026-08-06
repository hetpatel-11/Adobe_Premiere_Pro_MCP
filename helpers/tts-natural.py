# -*- coding: utf-8 -*-
"""
tts-natural.py — 자연스러운 한국어 TTS (edge-tts Python API)

사용법:
  python tts-natural.py --text "텍스트" --voice "남자" --emotion "밝은" --intensity 50 --output "out.mp3"
  python tts-natural.py --text-file input.txt --voice "여자아이" --emotion "귀여운" --output "out.mp3"

음성: 남자, 여자, 남자아이, 여자아이, 현수, 인준, 선희
감정: 기본, 밝은, 신남, 귀여운, 차분한, 진지한, 슬픈, 속삭임
"""

import asyncio
import argparse
import json
import os
import sys
import edge_tts

# ── 음성 프리셋 ──
VOICE_PRESETS = {
    "남자":     {"voice": "ko-KR-HyunsuMultilingualNeural", "pitch": 0,   "rate": 0},
    "여자":     {"voice": "ko-KR-SunHiNeural",              "pitch": 0,   "rate": 0},
    "남자아이": {"voice": "ko-KR-HyunsuMultilingualNeural", "pitch": 35,  "rate": 5},
    "여자아이": {"voice": "ko-KR-SunHiNeural",              "pitch": 30,  "rate": 3},
    "현수":     {"voice": "ko-KR-HyunsuMultilingualNeural", "pitch": 0,   "rate": 0},
    "인준":     {"voice": "ko-KR-InJoonNeural",             "pitch": 0,   "rate": 0},
    "선희":     {"voice": "ko-KR-SunHiNeural",              "pitch": 0,   "rate": 0},
    # 영어/일본어
    "andrew":   {"voice": "en-US-AndrewMultilingualNeural",  "pitch": 0,   "rate": 0},
    "ava":      {"voice": "en-US-AvaMultilingualNeural",     "pitch": 0,   "rate": 0},
    "keita":    {"voice": "ja-JP-KeitaNeural",               "pitch": 0,   "rate": 0},
    "nanami":   {"voice": "ja-JP-NanamiNeural",              "pitch": 0,   "rate": 0},
}

# ── 감정 프리셋 (pitch_hz, rate_pct, volume_pct) ──
EMOTION_PRESETS = {
    "기본":   {"pitch": 0,   "rate": 0,   "vol": 0},
    "밝은":   {"pitch": 18,  "rate": 5,   "vol": 3},
    "신남":   {"pitch": 30,  "rate": 10,  "vol": 5},
    "귀여운": {"pitch": 25,  "rate": 3,   "vol": 0},
    "차분한": {"pitch": -5,  "rate": -8,  "vol": -3},
    "진지한": {"pitch": -10, "rate": -3,  "vol": 2},
    "슬픈":   {"pitch": -12, "rate": -10, "vol": -5},
    "속삭임": {"pitch": 5,   "rate": -5,  "vol": -10},
}

# voice ID → preset name 매핑 (chat-monitor에서 voice ID로 넘어올 때)
VOICE_ID_MAP = {
    "ko-KR-HyunsuMultilingualNeural": "현수",
    "ko-KR-InJoonNeural": "인준",
    "ko-KR-SunHiNeural": "선희",
    "en-US-AndrewMultilingualNeural": "andrew",
    "en-US-AndrewNeural": "andrew",
    "en-US-AvaMultilingualNeural": "ava",
    "en-US-AvaNeural": "ava",
    "ja-JP-KeitaNeural": "keita",
    "ja-JP-NanamiNeural": "nanami",
}


def fmt_hz(val):
    return f"+{val}Hz" if val >= 0 else f"{val}Hz"

def fmt_pct(val):
    return f"+{val}%" if val >= 0 else f"{val}%"


async def generate_tts(text, voice_name, emotion, intensity, output_path,
                       extra_pitch=0, extra_rate=0, extra_vol=0):
    """TTS 생성 — edge_tts.Communicate API"""

    # 음성 프리셋
    preset = VOICE_PRESETS.get(voice_name)
    if not preset:
        # voice ID로 시도
        mapped = VOICE_ID_MAP.get(voice_name)
        if mapped:
            preset = VOICE_PRESETS[mapped]
        else:
            preset = VOICE_PRESETS["남자"]

    voice_id = preset["voice"]
    base_pitch = preset["pitch"]
    base_rate = preset["rate"]

    # 감정 프리셋 (강도 반영)
    emo = EMOTION_PRESETS.get(emotion, EMOTION_PRESETS["기본"])
    factor = max(0, min(100, intensity)) / 100.0
    emo_pitch = int(emo["pitch"] * factor)
    emo_rate = int(emo["rate"] * factor)
    emo_vol = int(emo["vol"] * factor)

    # 최종 값 계산
    final_pitch = base_pitch + emo_pitch + extra_pitch
    final_rate = base_rate + emo_rate + extra_rate
    final_vol = emo_vol + extra_vol

    # edge_tts Communicate
    communicate = edge_tts.Communicate(
        text,
        voice_id,
        pitch=fmt_hz(final_pitch),
        rate=fmt_pct(final_rate),
        volume=fmt_pct(final_vol),
    )
    await communicate.save(output_path)

    file_size = os.path.getsize(output_path)
    return {
        "success": True,
        "file": output_path,
        "size": file_size,
        "voice": voice_id,
        "voiceName": voice_name,
        "emotion": emotion,
        "pitch": final_pitch,
        "rate": final_rate,
        "vol": final_vol,
    }


async def main():
    parser = argparse.ArgumentParser(description="Natural Korean TTS")
    parser.add_argument("--text", default="", help="텍스트")
    parser.add_argument("--text-file", default="", help="텍스트 파일 경로")
    parser.add_argument("--voice", default="남자", help="음성 프리셋 또는 voice ID")
    parser.add_argument("--emotion", default="기본", help="감정 프리셋")
    parser.add_argument("--intensity", type=int, default=50, help="감정 강도 0-100")
    parser.add_argument("--pitch", type=int, default=0, help="추가 피치 보정 (Hz)")
    parser.add_argument("--rate", type=int, default=0, help="추가 속도 보정 (%)")
    parser.add_argument("--volume", type=int, default=0, help="추가 볼륨 보정 (%)")
    parser.add_argument("--output", required=True, help="출력 파일")

    args = parser.parse_args()

    # 텍스트 소스
    text = args.text
    if args.text_file and os.path.exists(args.text_file):
        with open(args.text_file, "r", encoding="utf-8") as f:
            text = f.read().strip()
    if not text:
        print(json.dumps({"success": False, "error": "No text provided"}))
        sys.exit(1)

    result = await generate_tts(
        text, args.voice, args.emotion, args.intensity, args.output,
        extra_pitch=args.pitch, extra_rate=args.rate, extra_vol=args.volume
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())

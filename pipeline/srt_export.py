"""
SRT 자막 내보내기 모듈
batch_transcribe.py가 만든 dialogue_map.json을 SRT 자막 파일로 변환합니다.
이 SRT를 Premiere 시퀀스에 캡션 트랙으로 삽입한 뒤 컷편집을 진행합니다.

사용법:
    python3 srt_export.py --dialogue ./output/dialogue_map.json --output ./output/sequence.srt
"""

import json
import argparse
from pathlib import Path


def _sec_to_srt_time(sec: float) -> str:
    """초 → SRT 타임코드 (HH:MM:SS,mmm)"""
    if sec < 0:
        sec = 0
    h = int(sec // 3600)
    m = int((sec % 3600) // 60)
    s = int(sec % 60)
    ms = int(round((sec - int(sec)) * 1000))
    if ms == 1000:
        ms = 0
        s += 1
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def export_srt(dialogue_path: str, output_path: str) -> str:
    with open(dialogue_path, encoding="utf-8") as f:
        data = json.load(f)

    lines = []
    idx = 1
    for clip in data.get("clips", []):
        for seg in clip.get("segments", []):
            start = seg.get("timeline_start", seg.get("clip_start", 0))
            end = seg.get("timeline_end", seg.get("clip_end", 0))
            text = seg.get("text", "").strip()
            if not text:
                continue
            lines.append(str(idx))
            lines.append(f"{_sec_to_srt_time(start)} --> {_sec_to_srt_time(end)}")
            lines.append(text)
            lines.append("")
            idx += 1

    out = Path(output_path)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"[SRT] 저장 완료: {out}  (자막 {idx-1}개)")
    return str(out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="dialogue_map.json → SRT")
    parser.add_argument("--dialogue", required=True, help="dialogue_map.json 경로")
    parser.add_argument("--output", default="./output/sequence.srt")
    args = parser.parse_args()

    export_srt(args.dialogue, args.output)

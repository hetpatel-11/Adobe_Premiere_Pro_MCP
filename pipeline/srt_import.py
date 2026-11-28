"""
SRT 가져오기 모듈 (새 워크플로우 STEP 2 - 시퀀스 캡션 대체 경로)

MCP read_sequence_captions가 캡션 트랙을 못 읽을 때,
외부에서 만든 SRT 파일을 직접 파싱해 captions.json으로 변환한다.

사용법:
    python3 srt_import.py --srt "/path/Sequence 01.srt" --output ./output/captions.json
"""

import re
import json
import argparse
from pathlib import Path


def _srt_time_to_sec(tc: str) -> float:
    # 00:01:02,500 → 62.5
    tc = tc.strip().replace(".", ",")
    h, m, rest = tc.split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000.0


def parse_srt(srt_path: str) -> list[dict]:
    raw = Path(srt_path).read_text(encoding="utf-8", errors="ignore")
    blocks = re.split(r"\n\s*\n", raw.strip())
    caps = []
    for b in blocks:
        lines = [l for l in b.splitlines() if l.strip() != ""]
        if len(lines) < 2:
            continue
        # 타임코드 라인 찾기
        tc_idx = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if tc_idx is None:
            continue
        start_s, end_s = lines[tc_idx].split("-->")
        text = " ".join(lines[tc_idx + 1:]).strip()
        try:
            caps.append({
                "start": round(_srt_time_to_sec(start_s), 3),
                "end": round(_srt_time_to_sec(end_s), 3),
                "text": text,
            })
        except ValueError:
            continue
    return caps


def main(srt_path: str, output_path: str):
    caps = parse_srt(srt_path)
    total = caps[-1]["end"] if caps else 0
    out = {"caption_count": len(caps), "total_duration": total, "captions": caps}
    Path(output_path).write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[SRT Import] 저장: {output_path}")
    print(f"[SRT Import] 자막 {len(caps)}개 / 마지막 {total/60:.1f}분")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SRT → captions.json")
    parser.add_argument("--srt", required=True)
    parser.add_argument("--output", default="./output/captions.json")
    args = parser.parse_args()
    main(args.srt, args.output)

"""
배치 트랜스크립션 모듈
시퀀스에 들어간 모든 소스 클립을 순서대로 전사하고,
시퀀스 타임라인 위치(누적 시간)에 매핑한 마스터 대화 맵을 생성합니다.

★ 이게 핵심: 편집 전에 "전체 영상에서 누가 언제 무슨 말을 하는지"를
   먼저 확보해야 대화·감정·이야기 기반 컷편집이 가능합니다.

사용법:
    python3 batch_transcribe.py \
        --clips-dir "/Volumes/WDBLACK/.../DJI_001" \
        --order order.json \
        --output ./output \
        --language en --model large-v3
"""

import os
import ssl
import json
import argparse
from pathlib import Path

ssl._create_default_https_context = ssl._create_unverified_context


def get_clip_duration(video_path: str) -> float:
    """ffprobe로 클립 길이(초) 추출"""
    import subprocess
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def transcribe_one(model, video_path: str, language: str, output_dir: str) -> list[dict]:
    """단일 클립 전사 (오디오 추출 → Whisper)"""
    import subprocess
    audio_path = Path(output_dir) / "_tmp_audio.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        str(audio_path)
    ], capture_output=True, text=True)

    result = model.transcribe(
        str(audio_path), language=language,
        word_timestamps=True, verbose=False,
    )
    segs = []
    for s in result["segments"]:
        segs.append({
            "clip_start": round(s["start"], 3),   # 클립 내부 시간
            "clip_end": round(s["end"], 3),
            "text": s["text"].strip(),
            "confidence": round(s.get("avg_logprob", 0), 3),
        })
    if audio_path.exists():
        audio_path.unlink()
    return segs


def batch_transcribe(clips_dir: str, order: list[str], output_dir: str,
                     language: str, model_name: str) -> dict:
    """
    order: 시퀀스에 배치된 순서대로의 클립 파일명 리스트.
    각 클립을 전사하고 누적 시간(timeline_start)으로 매핑.
    """
    import whisper

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    print(f"[Batch] Whisper 모델 로딩: {model_name}")
    model = whisper.load_model(model_name)

    clips_dir = Path(clips_dir)
    timeline_cursor = 0.0
    all_clips = []

    for i, fname in enumerate(order, 1):
        vpath = clips_dir / fname
        if not vpath.exists():
            print(f"[Batch] ⚠ 파일 없음, 건너뜀: {fname}")
            continue

        dur = get_clip_duration(str(vpath))
        print(f"[Batch] ({i}/{len(order)}) 전사 중: {fname}  (길이 {dur:.1f}s)")
        segs = transcribe_one(model, str(vpath), language, output_dir)

        # 클립 내부 시간 → 시퀀스 타임라인 시간으로 변환
        for s in segs:
            s["timeline_start"] = round(timeline_cursor + s["clip_start"], 3)
            s["timeline_end"] = round(timeline_cursor + s["clip_end"], 3)

        all_clips.append({
            "order_index": i,
            "clip_name": fname,
            "timeline_start": round(timeline_cursor, 3),
            "timeline_end": round(timeline_cursor + dur, 3),
            "duration": round(dur, 3),
            "full_text": " ".join(s["text"] for s in segs),
            "segments": segs,
        })
        timeline_cursor += dur

    result = {
        "total_clips": len(all_clips),
        "total_duration": round(timeline_cursor, 3),
        "clips": all_clips,
    }
    out_path = Path(output_dir) / "dialogue_map.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n[Batch] 완료! 마스터 대화 맵 저장: {out_path}")
    print(f"[Batch] 총 {len(all_clips)}개 클립, {timeline_cursor/60:.1f}분")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="모든 소스 클립 배치 전사")
    parser.add_argument("--clips-dir", required=True, help="소스 클립 폴더")
    parser.add_argument("--order", required=True,
                        help="시퀀스 배치 순서 클립 파일명 JSON 배열 파일")
    parser.add_argument("--output", default="./output")
    parser.add_argument("--language", default="en")
    parser.add_argument("--model", default="large-v3")
    args = parser.parse_args()

    with open(args.order, encoding="utf-8") as f:
        order = json.load(f)

    batch_transcribe(args.clips_dir, order, args.output, args.language, args.model)

"""
통합 분석 모듈 (방법1 Scene Detection + Whisper + 방법3 Claude Vision용 프레임)

각 소스 클립에 대해 한 번에:
  1) PySceneDetect  → 장면 경계 타임코드 + 대표 프레임 자동 추출
  2) Whisper        → 대사 전사
  3) 타임코드 스냅   → Whisper 오차를 Scene 경계로 보정
  4) 프레임 정리     → frames/<clip>/ 에 장면별 이미지 저장

→ 통합 산출물:
   - analysis.json   (클립 → 장면 → {타임코드, 대사, 프레임경로})
   - sequence.srt    (시퀀스 자막 삽입용)

이후 [4단계]는 Claude가 frames/ 이미지를 직접 보고(analysis.json 대사와 결합)
이해도 게이트 → 편집 판단을 수행한다.

사용법:
    python3 analyze_clips.py \
        --clips-dir "/Volumes/WDBLACK/.../DJI_001" \
        --order ./output/order.json \
        --output ./output \
        --language en --model large-v3 --threshold 27
"""

import os
import ssl
import json
import argparse
import subprocess
from pathlib import Path

ssl._create_default_https_context = ssl._create_unverified_context


# ---------- 유틸 ----------

def get_duration(video_path: str) -> float:
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
           "-of", "default=noprint_wrappers=1:nokey=1", str(video_path)]
    out = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def _tc_to_sec(tc: str) -> float:
    p = tc.split(":")
    return int(p[0]) * 3600 + int(p[1]) * 60 + float(p[2])


# ---------- 1) Scene Detection ----------

def detect_scenes(video_path: str, frames_dir: Path, threshold: float) -> list[dict]:
    """PySceneDetect로 장면 경계 + 대표 프레임(장면당 1장) 추출"""
    frames_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(video_path).stem
    csv_dir = frames_dir  # CSV도 같은 폴더에

    cmd = [
        "python3", "-m", "scenedetect",
        "--input", str(video_path),
        "--output", str(frames_dir),
        "detect-content", "--threshold", str(threshold),
        "list-scenes",
        "save-images", "--num-images", "1",
    ]
    subprocess.run(cmd, capture_output=True, text=True)

    # CSV 파싱
    candidates = list(frames_dir.glob(f"{stem}-Scenes.csv")) or list(frames_dir.glob("*-Scenes.csv"))
    scenes = []
    if candidates:
        lines = candidates[0].read_text(encoding="utf-8").splitlines()
        if len(lines) >= 2:
            header = [h.strip() for h in lines[0].split(",")]
            try:
                i_num = header.index("Scene Number")
                i_s = header.index("Start Time (seconds)")
                i_e = header.index("End Time (seconds)")
            except ValueError:
                i_num, i_s, i_e = 0, 3, 6
            for line in lines[1:]:
                parts = line.split(",")
                if len(parts) <= max(i_num, i_s, i_e):
                    continue
                try:
                    n = int(parts[i_num].strip())
                    s = float(parts[i_s].strip())
                    e = float(parts[i_e].strip())
                except ValueError:
                    continue
                fp = frames_dir / f"{stem}-Scene-{n:03d}-01.jpg"
                scenes.append({
                    "scene_number": n,
                    "clip_start": round(s, 3),
                    "clip_end": round(e, 3),
                    "frame_path": str(fp) if fp.exists() else None,
                })

    # 장면 감지가 0개면(원테이크) 전체를 1개 장면으로 처리
    if not scenes:
        dur = get_duration(video_path)
        fp = frames_dir / f"{stem}-Scene-001-01.jpg"
        # 대표 프레임 1장 강제 추출 (중간 지점)
        subprocess.run([
            "ffmpeg", "-y", "-ss", str(dur / 2), "-i", str(video_path),
            "-frames:v", "1", str(fp)
        ], capture_output=True, text=True)
        scenes.append({
            "scene_number": 1, "clip_start": 0.0, "clip_end": round(dur, 3),
            "frame_path": str(fp) if fp.exists() else None,
        })
    return scenes


# ---------- 2) Whisper 전사 ----------

def transcribe(model, video_path: str, language: str, tmp_dir: Path) -> list[dict]:
    audio = tmp_dir / "_tmp.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(audio)
    ], capture_output=True, text=True)
    result = model.transcribe(str(audio), language=language,
                              word_timestamps=True, verbose=False)
    segs = [{
        "clip_start": round(s["start"], 3),
        "clip_end": round(s["end"], 3),
        "text": s["text"].strip(),
        "confidence": round(s.get("avg_logprob", 0), 3),
    } for s in result["segments"]]
    if audio.exists():
        audio.unlink()
    return segs


# ---------- 3) 타임코드 스냅 보정 ----------

def snap_to_scenes(segs: list[dict], scenes: list[dict], thr: float = 0.5) -> list[dict]:
    boundaries = sorted({b for sc in scenes for b in (sc["clip_start"], sc["clip_end"])})
    for seg in segs:
        seg["snapped"] = False
        for b in boundaries:
            if abs(seg["clip_start"] - b) <= thr:
                seg["clip_start"] = b
                seg["snapped"] = True
                break
        for b in boundaries:
            if abs(seg["clip_end"] - b) <= thr:
                seg["clip_end"] = b
                seg["snapped"] = True
                break
    return segs


# ---------- 메인 ----------

def analyze(clips_dir: str, order: list[str], output_dir: str,
            language: str, model_name: str, threshold: float):
    import whisper

    out = Path(output_dir)
    frames_root = out / "frames"
    out.mkdir(parents=True, exist_ok=True)
    frames_root.mkdir(parents=True, exist_ok=True)

    print(f"[Analyze] Whisper 모델 로딩: {model_name}")
    model = whisper.load_model(model_name)

    clips_dir = Path(clips_dir)
    cursor = 0.0
    all_clips = []

    for i, fname in enumerate(order, 1):
        vpath = clips_dir / fname
        if not vpath.exists():
            print(f"[Analyze] ⚠ 없음, 건너뜀: {fname}")
            continue
        dur = get_duration(str(vpath))
        clip_frames = frames_root / Path(fname).stem
        print(f"[Analyze] ({i}/{len(order)}) {fname}  ({dur:.1f}s)")

        # 1) Scene Detection + 프레임
        print("           · 장면 감지 + 프레임 추출")
        scenes = detect_scenes(str(vpath), clip_frames, threshold)
        # 2) Whisper
        print("           · Whisper 전사")
        segs = transcribe(model, str(vpath), language, out)
        # 3) 스냅 보정
        segs = snap_to_scenes(segs, scenes)

        # 클립 내부 시간 → 시퀀스 타임라인 시간
        for sc in scenes:
            sc["timeline_start"] = round(cursor + sc["clip_start"], 3)
            sc["timeline_end"] = round(cursor + sc["clip_end"], 3)
        for s in segs:
            s["timeline_start"] = round(cursor + s["clip_start"], 3)
            s["timeline_end"] = round(cursor + s["clip_end"], 3)
            s["cut_safe_start"] = round(max(0, s["timeline_start"] - 0.15), 3)
            s["cut_safe_end"] = round(s["timeline_end"] + 0.15, 3)

        all_clips.append({
            "order_index": i,
            "clip_name": fname,
            "timeline_start": round(cursor, 3),
            "timeline_end": round(cursor + dur, 3),
            "duration": round(dur, 3),
            "scene_count": len(scenes),
            "scenes": scenes,
            "full_text": " ".join(s["text"] for s in segs),
            "segments": segs,
        })
        cursor += dur

    result = {
        "total_clips": len(all_clips),
        "total_duration": round(cursor, 3),
        "frames_root": str(frames_root),
        "clips": all_clips,
    }
    (out / "analysis.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[Analyze] 통합 분석 저장: {out / 'analysis.json'}")
    print(f"[Analyze] 총 {len(all_clips)}개 클립 / {cursor/60:.1f}분 / "
          f"장면 {sum(c['scene_count'] for c in all_clips)}개 / 프레임 폴더: {frames_root}")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="통합 분석 (Scene+Whisper+Frame)")
    parser.add_argument("--clips-dir", required=True)
    parser.add_argument("--order", required=True, help="시퀀스 클립 순서 JSON")
    parser.add_argument("--output", default="./output")
    parser.add_argument("--language", default="en")
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--threshold", type=float, default=27.0)
    args = parser.parse_args()

    with open(args.order, encoding="utf-8") as f:
        order = json.load(f)
    analyze(args.clips_dir, order, args.output, args.language, args.model, args.threshold)

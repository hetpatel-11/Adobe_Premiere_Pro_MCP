"""
Whisper 트랜스크립션 모듈
오디오를 추출하고 Whisper로 전사한 뒤, Scene Detection 타임코드로 보정합니다.
"""

import os
import ssl
import json
import subprocess
import argparse
from pathlib import Path

# macOS Python SSL 인증서 오류 우회
ssl._create_default_https_context = ssl._create_unverified_context


def extract_audio(video_path: str, output_dir: str) -> str:
    """ffmpeg로 영상에서 오디오 추출"""
    audio_path = Path(output_dir) / "audio.wav"
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",                    # 비디오 제외
        "-ar", "16000",           # Whisper 최적 샘플레이트
        "-ac", "1",               # 모노
        "-c:a", "pcm_s16le",
        str(audio_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"오디오 추출 실패: {result.stderr}")
    print(f"[Transcribe] 오디오 추출 완료: {audio_path}")
    return str(audio_path)


def transcribe(audio_path: str, language: str = "ko", model: str = "base") -> list[dict]:
    """
    Whisper로 오디오 전사.
    model: tiny / base / small / medium / large (클수록 정확하지만 느림)
    """
    import whisper

    print(f"[Transcribe] Whisper 모델 로딩: {model}")
    w_model = whisper.load_model(model)

    print(f"[Transcribe] 전사 중... (언어: {language})")
    result = w_model.transcribe(
        audio_path,
        language=language,
        word_timestamps=True,     # 단어 단위 타임스탬프 (정확도 향상)
        verbose=False,
    )

    segments = []
    for seg in result["segments"]:
        segments.append({
            "start": round(seg["start"], 3),
            "end": round(seg["end"], 3),
            "text": seg["text"].strip(),
            "confidence": round(seg.get("avg_logprob", 0), 3),
            "words": [
                {
                    "word": w["word"].strip(),
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                }
                for w in seg.get("words", [])
            ],
        })

    print(f"[Transcribe] 전사 완료: {len(segments)}개 세그먼트")
    return segments


def correct_timestamps(segments: list[dict], scenes: list[dict], snap_threshold: float = 0.5) -> list[dict]:
    """
    Whisper 타임코드를 Scene Detection 경계에 스냅 보정.
    snap_threshold: 이 초 이내면 Scene 경계로 이동 (기본 0.5초)
    """
    scene_boundaries = []
    for s in scenes:
        scene_boundaries.append(s["start"])
        scene_boundaries.append(s["end"])
    scene_boundaries = sorted(set(scene_boundaries))

    corrected = []
    for seg in segments:
        new_seg = seg.copy()
        new_seg["original_start"] = seg["start"]
        new_seg["original_end"] = seg["end"]
        new_seg["corrected"] = False

        # 시작 타임코드 보정
        for boundary in scene_boundaries:
            if abs(seg["start"] - boundary) <= snap_threshold:
                new_seg["start"] = boundary
                new_seg["corrected"] = True
                break

        # 끝 타임코드 보정
        for boundary in scene_boundaries:
            if abs(seg["end"] - boundary) <= snap_threshold:
                new_seg["end"] = boundary
                new_seg["corrected"] = True
                break

        # 편집 여유 버퍼 추가 (±0.15초)
        new_seg["cut_safe_start"] = max(0, new_seg["start"] - 0.15)
        new_seg["cut_safe_end"] = new_seg["end"] + 0.15

        corrected.append(new_seg)

    corrected_count = sum(1 for s in corrected if s["corrected"])
    print(f"[Transcribe] 타임코드 보정: {corrected_count}/{len(corrected)}개 세그먼트")
    return corrected


def assign_scenes(segments: list[dict], scenes: list[dict]) -> list[dict]:
    """각 세그먼트에 해당 장면 ID를 태깅"""
    for seg in segments:
        seg["scene_id"] = None
        mid = (seg["start"] + seg["end"]) / 2
        for scene in scenes:
            if scene["start"] <= mid < scene["end"]:
                seg["scene_id"] = scene["scene_id"]
                break
    return segments


def save_transcript_json(segments: list[dict], output_dir: str) -> str:
    path = Path(output_dir) / "transcript.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
    print(f"[Transcribe] 저장: {path}")
    return str(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Whisper 트랜스크립션")
    parser.add_argument("--video", required=True, help="영상 파일 경로")
    parser.add_argument("--output", default="./output", help="출력 디렉토리")
    parser.add_argument("--language", default="ko", help="언어 코드 (ko, en, de...)")
    parser.add_argument("--model", default="large-v3",
                        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
                        help="Whisper 모델 크기 (기본: large-v3)")
    parser.add_argument("--scenes", help="scenes.json 경로 (타임코드 보정용)")
    args = parser.parse_args()

    Path(args.output).mkdir(parents=True, exist_ok=True)
    audio = extract_audio(args.video, args.output)
    segments = transcribe(audio, args.language, args.model)

    if args.scenes and Path(args.scenes).exists():
        with open(args.scenes) as f:
            scenes = json.load(f)
        segments = correct_timestamps(segments, scenes)
        segments = assign_scenes(segments, scenes)

    save_transcript_json(segments, args.output)

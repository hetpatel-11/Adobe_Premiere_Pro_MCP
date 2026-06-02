"""
Scene Detection 모듈
PySceneDetect로 장면 경계를 감지하고 대표 프레임을 추출합니다.
"""

import os
import json
import subprocess
import argparse
from pathlib import Path


def detect_scenes(video_path: str, output_dir: str, threshold: float = 27.0) -> list[dict]:
    """
    PySceneDetect로 장면 경계 감지 및 대표 프레임 추출.
    threshold: 낮을수록 민감 (장면 많아짐), 높을수록 둔감 (장면 적어짐)
    """
    video_path = Path(video_path)
    frames_dir = Path(output_dir) / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Scene Detection] 분석 중: {video_path.name}")
    print(f"[Scene Detection] 민감도(threshold): {threshold}")

    # PySceneDetect CLI 실행 (CSV는 output_dir 안에 {stem}-Scenes.csv로 자동 생성됨)
    cmd = [
        "python3", "-m", "scenedetect",
        "--input", str(video_path),
        "--output", str(output_dir),
        "detect-content",
        "--threshold", str(threshold),
        "list-scenes",
        "save-images",
        "--num-images", "1",
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    print(f"[Scene Detection] stdout: {result.stdout[:300] if result.stdout else '없음'}")
    if result.returncode != 0:
        print(f"[오류] stderr: {result.stderr[:300]}")
        raise RuntimeError("PySceneDetect 실행 실패")

    # PySceneDetect가 생성한 CSV 파일 찾기
    candidates = list(Path(output_dir).glob("*Scenes*.csv")) + list(Path(output_dir).glob("*.csv"))
    print(f"[Scene Detection] 생성된 CSV 파일: {[str(c) for c in candidates]}")
    if candidates:
        csv_path = candidates[0]
    else:
        csv_path = Path(output_dir) / f"{video_path.stem}-Scenes.csv"

    # CSV 파싱
    scenes = _parse_scenes_csv(csv_path, frames_dir, video_path.stem)
    print(f"[Scene Detection] 감지된 장면 수: {len(scenes)}")
    return scenes


def _parse_scenes_csv(csv_path: Path, frames_dir: Path, video_stem: str) -> list[dict]:
    scenes = []
    if not csv_path.exists():
        return scenes

    with open(csv_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    if len(lines) < 2:
        return scenes

    # 헤더 파싱으로 컬럼 인덱스 자동 감지
    header = [h.strip() for h in lines[0].split(",")]
    try:
        idx_scene = header.index("Scene Number")
        idx_start_sec = header.index("Start Time (seconds)")
        idx_end_sec = header.index("End Time (seconds)")
    except ValueError:
        # 폴백: 고정 인덱스 사용
        idx_scene, idx_start_sec, idx_end_sec = 0, 3, 6

    for line in lines[1:]:
        parts = line.strip().split(",")
        if len(parts) <= max(idx_scene, idx_start_sec, idx_end_sec):
            continue
        try:
            scene_num = int(parts[idx_scene].strip())
            start_sec = float(parts[idx_start_sec].strip())
            end_sec = float(parts[idx_end_sec].strip())

            frame_path = frames_dir / f"{video_stem}-Scene-{scene_num:03d}-01.jpg"

            scenes.append({
                "scene_id": f"S_{scene_num:03d}",
                "scene_number": scene_num,
                "start": round(start_sec, 3),
                "end": round(end_sec, 3),
                "duration": round(end_sec - start_sec, 3),
                "frame_path": str(frame_path) if frame_path.exists() else None,
            })
        except (ValueError, IndexError):
            continue

    return scenes


def _tc_to_seconds(tc: str) -> float:
    """HH:MM:SS.mmm → 초 변환"""
    parts = tc.split(":")
    h, m = int(parts[0]), int(parts[1])
    s = float(parts[2])
    return h * 3600 + m * 60 + s


def save_scenes_json(scenes: list[dict], output_dir: str) -> str:
    path = Path(output_dir) / "scenes.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(scenes, f, ensure_ascii=False, indent=2)
    print(f"[Scene Detection] 저장: {path}")
    return str(path)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scene Detection")
    parser.add_argument("--video", required=True, help="영상 파일 경로")
    parser.add_argument("--output", default="./output", help="출력 디렉토리")
    parser.add_argument("--threshold", type=float, default=27.0, help="감지 민감도")
    args = parser.parse_args()

    scenes = detect_scenes(args.video, args.output, args.threshold)
    save_scenes_json(scenes, args.output)

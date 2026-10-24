"""
메인 파이프라인 실행 스크립트
사용법: python3 run_pipeline.py --video /path/to/video.mp4 --language ko
"""

import argparse
import json
import sys
from pathlib import Path

from scene_detect import detect_scenes, save_scenes_json
from transcribe import extract_audio, transcribe, correct_timestamps, assign_scenes, save_transcript_json
from integrate import integrate


def run(video_path: str, output_dir: str, language: str, whisper_model: str, threshold: float):
    video_path = Path(video_path)
    if not video_path.exists():
        print(f"[오류] 파일을 찾을 수 없습니다: {video_path}")
        sys.exit(1)

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    print(f"\n{'='*50}")
    print(f"  막시마 김밥 편집 파이프라인")
    print(f"  영상: {video_path.name}")
    print(f"{'='*50}\n")

    # Step 1: Scene Detection
    print("[ 1/4 ] 장면 감지 중...")
    scenes = detect_scenes(str(video_path), output_dir, threshold)
    scenes_json = save_scenes_json(scenes, output_dir)

    # Step 2: Whisper 트랜스크립션
    print("\n[ 2/4 ] 오디오 추출 및 전사 중...")
    audio_path = extract_audio(str(video_path), output_dir)
    segments = transcribe(audio_path, language, whisper_model)

    # Step 3: 타임코드 보정
    print("\n[ 3/4 ] 타임코드 보정 중...")
    segments = correct_timestamps(segments, scenes)
    segments = assign_scenes(segments, scenes)
    save_transcript_json(segments, output_dir)

    # Step 4: 통합
    print("\n[ 4/4 ] 마스터 편집 플랜 생성 중...")
    transcript_json = str(Path(output_dir) / "transcript.json")
    result = integrate(scenes_json, transcript_json, output_dir)

    print(f"\n{'='*50}")
    print(f"  완료!")
    print(f"  감지된 장면: {result['total_scenes']}개")
    print(f"  총 길이: {result['total_duration']:.1f}초 ({result['total_duration']/60:.1f}분)")
    print(f"  출력 파일: {output_dir}/master_edit_plan.json")
    print(f"{'='*50}")
    print("\n이제 Claude Code에게 다음과 같이 요청하세요:")
    print(f'  "master_edit_plan.json을 읽고 [편집 주제/스타일]로 컷편집 해줘"')


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="영상 편집 파이프라인")
    parser.add_argument("--video", required=True, help="영상 파일 경로 (mp4, mov 등)")
    parser.add_argument("--output", default="./output", help="출력 디렉토리 (기본: ./output)")
    parser.add_argument("--language", default="en", help="주 언어 코드 (en/ko/de/ja...) 기본: en")
    parser.add_argument("--model", default="large-v3",
                        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
                        help="Whisper 모델 크기 (기본: large-v3)")
    parser.add_argument("--threshold", type=float, default=27.0,
                        help="장면 감지 민감도 (낮을수록 민감, 기본: 27)")
    args = parser.parse_args()

    run(args.video, args.output, args.language, args.model, args.threshold)

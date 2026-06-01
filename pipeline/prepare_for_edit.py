"""
편집 준비 오케스트레이터 (4단계 파이프라인 STEP 1~3 자동 실행)

설명한 파이프라인 그대로:
  [1단계] PySceneDetect → 정확한 컷 타임코드 + 대표 프레임
  [2단계] Whisper       → 대사 (Scene 타임코드로 스냅 보정)
  [3단계] 프레임 추출    → frames/<clip>/ 에 장면별 이미지

→ 산출물:
   - analysis.json  (장면 + 대사 + 프레임경로, 시퀀스 타임라인 매핑)
   - sequence.srt   (시퀀스 캡션 삽입용)

[4단계]는 이 스크립트 종료 후 Claude가 수행한다:
   frames/ 이미지를 직접 보고(Vision) + analysis.json 대사 읽고
   → 이해도 게이트 제출 → 사용자 확인 → 컷편집.

사용법:
    python3 prepare_for_edit.py \
        --clips-dir "/Volumes/WDBLACK/.../DJI_001" \
        --order ./output/order.json \
        --output ./output \
        --language en --model large-v3 --threshold 27
"""

import json
import argparse
from pathlib import Path

from analyze_clips import analyze
from srt_export import export_srt


def prepare(clips_dir: str, order_path: str, output_dir: str,
            language: str, model_name: str, threshold: float):
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    with open(order_path, encoding="utf-8") as f:
        order = json.load(f)

    print("=" * 60)
    print("  편집 준비 — [1~3단계] 통합 분석 (Scene + Whisper + Frame)")
    print("=" * 60)
    data = analyze(clips_dir, order, output_dir, language, model_name, threshold)

    print("\n" + "=" * 60)
    print("  SRT 자막 생성")
    print("=" * 60)
    analysis_path = str(out / "analysis.json")
    srt_path = str(out / "sequence.srt")
    export_srt(analysis_path, srt_path)

    total_scenes = sum(c["scene_count"] for c in data["clips"])
    print("\n" + "=" * 60)
    print("  ✅ [1~3단계] 완료. 다음 = [4단계] Claude 수행")
    print("=" * 60)
    print(f"  1) Premiere 자막 삽입: create_caption_track <- {srt_path}")
    print(f"  2) read_sequence_captions 로 검증")
    print(f"  3) Claude가 frames/ 이미지 직접 보기 (Vision) + analysis.json 대사 결합")
    print(f"  4) ★이해도 게이트★ 제출 (EDITING_WORKFLOW.md STEP 3)")
    print(f"     - 클립별 1줄 요약 ({data['total_clips']}개 전부)")
    print(f"     - 전체 스토리 흐름 (기승전결)")
    print(f"     - 하이라이트 후보 (타임코드)")
    print(f"     - 목표 길이 계획 (10~20분)")
    print(f"  5) 사용자 '진행' 확인 후에만 컷편집")
    print(f"\n  분석 완료: {data['total_clips']}개 클립 / "
          f"{data['total_duration']/60:.1f}분 / 장면 {total_scenes}개")
    print(f"  프레임 폴더: {data['frames_root']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="편집 준비 (통합 분석 + SRT)")
    parser.add_argument("--clips-dir", required=True)
    parser.add_argument("--order", required=True, help="시퀀스 클립 순서 JSON")
    parser.add_argument("--output", default="./output")
    parser.add_argument("--language", default="en")
    parser.add_argument("--model", default="large-v3")
    parser.add_argument("--threshold", type=float, default=27.0)
    args = parser.parse_args()

    prepare(args.clips_dir, args.order, args.output,
            args.language, args.model, args.threshold)

"""
편집 준비 오케스트레이터 (STEP 1~2 자동 실행)

컷편집 전에 반드시 실행한다:
  STEP 1) 모든 소스 클립 배치 전사 → dialogue_map.json
  STEP 2) SRT 생성 → sequence.srt (시퀀스 캡션 삽입용)

이 스크립트가 끝나면 Claude는 dialogue_map.json을 읽고
'이해도 게이트'(클립별 요약 + 스토리 흐름 + 하이라이트 + 길이계획)를
사용자에게 제출해야 한다. 게이트 통과 전 컷편집 금지.

사용법:
    python3 prepare_for_edit.py \
        --clips-dir "/Volumes/WDBLACK/.../DJI_001" \
        --order ./output/order.json \
        --output ./output \
        --language en --model large-v3
"""

import json
import argparse
from pathlib import Path

from batch_transcribe import batch_transcribe
from srt_export import export_srt


def prepare(clips_dir: str, order_path: str, output_dir: str,
            language: str, model_name: str):
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    with open(order_path, encoding="utf-8") as f:
        order = json.load(f)

    print("=" * 56)
    print("  편집 준비 — STEP 1: 전체 클립 배치 전사")
    print("=" * 56)
    data = batch_transcribe(clips_dir, order, output_dir, language, model_name)

    print("\n" + "=" * 56)
    print("  편집 준비 — STEP 2: SRT 자막 생성")
    print("=" * 56)
    dialogue_path = str(Path(output_dir) / "dialogue_map.json")
    srt_path = str(Path(output_dir) / "sequence.srt")
    export_srt(dialogue_path, srt_path)

    print("\n" + "=" * 56)
    print("  ✅ 준비 완료. 다음 순서:")
    print("=" * 56)
    print(f"  1) Premiere에 자막 삽입: create_caption_track <- {srt_path}")
    print(f"  2) read_sequence_captions 로 삽입 검증")
    print(f"  3) ★이해도 게이트★ 제출 (EDITING_WORKFLOW.md STEP 3)")
    print(f"     - 클립별 1줄 요약 ({data['total_clips']}개 전부)")
    print(f"     - 전체 스토리 흐름 (기승전결)")
    print(f"     - 하이라이트 후보 (타임코드)")
    print(f"     - 목표 길이 계획 (10~20분)")
    print(f"  4) 사용자 '진행' 확인 후에만 컷편집 시작")
    print(f"\n  총 {data['total_clips']}개 클립 / {data['total_duration']/60:.1f}분 전사 완료")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="편집 준비 (전사 + SRT)")
    parser.add_argument("--clips-dir", required=True)
    parser.add_argument("--order", required=True, help="시퀀스 클립 순서 JSON")
    parser.add_argument("--output", default="./output")
    parser.add_argument("--language", default="en")
    parser.add_argument("--model", default="large-v3")
    args = parser.parse_args()

    prepare(args.clips_dir, args.order, args.output, args.language, args.model)

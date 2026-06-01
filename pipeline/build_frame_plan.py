"""
프레임 추출 계획 생성 모듈 (새 워크플로우 STEP 2)

입력: 시퀀스 자막 (read_sequence_captions 결과를 저장한 captions.json)
출력: frame_plan.json — export_frame(MCP)으로 프레임을 추출할 타임코드 목록

규칙:
- 자막마다 중간 지점에서 1장 (말하는 장면/표정 파악용)
- 자막이 긴 경우(>8초) 추가로 분할 추출
- 자막 사이 무음 구간이 길면(>10초) 그 사이도 추출 (장면 전환/이동 파악용)

사용법:
    python3 build_frame_plan.py \
        --captions ./output/captions.json \
        --output ./output/frame_plan.json \
        --gap 10 --long 8
"""

import json
import argparse
from pathlib import Path


def build_plan(captions: list[dict], gap_thr: float = 10.0,
               long_thr: float = 8.0) -> list[dict]:
    """자막 목록 → 프레임 추출 타임코드 목록"""
    plan = []
    prev_end = 0.0

    for i, cap in enumerate(captions):
        start = float(cap.get("start", 0))
        end = float(cap.get("end", start))
        text = (cap.get("text") or "").strip()

        # 자막 직전 무음 구간이 길면 그 사이에서 1장 (장면 전환)
        if start - prev_end > gap_thr:
            mid_gap = round((prev_end + start) / 2, 3)
            plan.append({"time": mid_gap, "reason": "silent_gap", "text": ""})

        # 자막 중간 지점 1장
        mid = round((start + end) / 2, 3)
        plan.append({"time": mid, "reason": "caption_mid", "text": text})

        # 긴 자막은 1/4, 3/4 지점 추가
        if end - start > long_thr:
            plan.append({"time": round(start + (end - start) * 0.25, 3),
                         "reason": "long_caption", "text": text})
            plan.append({"time": round(start + (end - start) * 0.75, 3),
                         "reason": "long_caption", "text": text})

        prev_end = end

    # 시간순 정렬 + 중복 제거(0.5초 이내)
    plan.sort(key=lambda x: x["time"])
    deduped = []
    for p in plan:
        if deduped and abs(p["time"] - deduped[-1]["time"]) < 0.5:
            continue
        deduped.append(p)

    # 프레임 파일명 부여
    for idx, p in enumerate(deduped, 1):
        p["index"] = idx
        p["frame_file"] = f"frame_{idx:04d}_{p['time']:.1f}s.jpg"
    return deduped


def main(captions_path: str, output_path: str, gap_thr: float, long_thr: float):
    with open(captions_path, encoding="utf-8") as f:
        data = json.load(f)
    # read_sequence_captions 결과: {captions:[...]} 또는 바로 [...] 둘 다 허용
    captions = data.get("captions", data) if isinstance(data, dict) else data

    plan = build_plan(captions, gap_thr, long_thr)
    out = {
        "total_frames": len(plan),
        "caption_count": len(captions),
        "frames": plan,
    }
    Path(output_path).write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[FramePlan] 저장: {output_path}")
    print(f"[FramePlan] 자막 {len(captions)}개 → 추출 프레임 {len(plan)}장")
    print(f"[FramePlan] 다음: 각 time마다 export_frame(MCP)으로 프레임 추출")
    return out


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="자막 → 프레임 추출 계획")
    parser.add_argument("--captions", required=True, help="captions.json 경로")
    parser.add_argument("--output", default="./output/frame_plan.json")
    parser.add_argument("--gap", type=float, default=10.0, help="무음 구간 임계(초)")
    parser.add_argument("--long", type=float, default=8.0, help="긴 자막 임계(초)")
    args = parser.parse_args()
    main(args.captions, args.output, args.gap, args.long)

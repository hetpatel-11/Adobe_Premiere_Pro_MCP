"""
통합 모듈
Scene Detection + Whisper 결과를 하나의 master_edit_plan.json으로 합칩니다.
Claude가 이 파일을 읽고 편집 판단을 내립니다.
"""

import json
import argparse
from pathlib import Path


def _suggest_edit_techniques(scene: dict) -> list[str]:
    """장면 특성에 따라 편집 기술 자동 추천"""
    hints = []
    text = scene.get("full_text", "").lower()
    duration = scene.get("duration", 0)

    # 긴 단순 장면 → Speed Ramping
    if duration > 15 and len(text) < 20:
        hints.append("speed_ramp: 단순/이동 장면, 200~400% 가속 권장")

    # 짧고 임팩트 있는 장면 → Punch-In
    if duration < 5 and scene.get("segments"):
        hints.append("punch_in: 짧은 반응 장면, scale 125% 순간 확대")

    # 대화 장면 → J-Cut/L-Cut
    if len(scene.get("segments", [])) >= 2:
        hints.append("j_cut_or_l_cut: 다중 발화 장면, 오디오 선행/후행 전환")

    # 감탄사/웃음/리액션 키워드
    reaction_keywords = ["oh", "wow", "ah", "what", "really", "wait", "no", "why"]
    if any(kw in text for kw in reaction_keywords):
        hints.append("punch_in: 리액션 감지, 강조 확대 적용")
        hints.append("off_beat_mute: 황당한 순간, BGM 음소거 후 정적 효과")

    return hints


def integrate(scenes_path: str, transcript_path: str, output_dir: str) -> dict:
    with open(scenes_path, encoding="utf-8") as f:
        scenes = json.load(f)
    with open(transcript_path, encoding="utf-8") as f:
        transcript = json.load(f)

    # 장면별로 대사 모으기
    scene_map = {s["scene_id"]: s.copy() for s in scenes}
    for s in scene_map.values():
        s["segments"] = []

    for seg in transcript:
        sid = seg.get("scene_id")
        if sid and sid in scene_map:
            scene_map[sid]["segments"].append({
                "start": seg["start"],
                "end": seg["end"],
                "cut_safe_start": seg.get("cut_safe_start", seg["start"]),
                "cut_safe_end": seg.get("cut_safe_end", seg["end"]),
                "text": seg["text"],
                "corrected": seg.get("corrected", False),
            })

    # 장면에 full_text + 편집 힌트 추가
    for s in scene_map.values():
        s["full_text"] = " ".join(seg["text"] for seg in s["segments"])
        s["edit_hints"] = _suggest_edit_techniques(s)

    result = {
        "total_scenes": len(scenes),
        "total_duration": scenes[-1]["end"] if scenes else 0,
        "editing_template": {
            "structure": {
                "hook":      {"start": 0,    "end": 90,   "label": "오프닝 & 훅"},
                "buildup":   {"start": 90,   "end": 300,  "label": "빌드업"},
                "deepdive":  {"start": 300,  "end": 540,  "label": "딥 다이브"},
                "climax":    {"start": 540,  "end": 720,  "label": "클라이맥스"},
                "outro":     {"start": 720,  "end": 810,  "label": "아웃로"},
            },
            "narrative": "옵션B - 현대식 기승전결 (예능/반전 중심)",
            "reversal_target_sec": 330,
        },
        "scenes": list(scene_map.values()),
    }

    out_path = Path(output_dir) / "master_edit_plan.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"[Integrate] 마스터 편집 플랜 저장: {out_path}")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Scene + Transcript 통합")
    parser.add_argument("--scenes", required=True, help="scenes.json 경로")
    parser.add_argument("--transcript", required=True, help="transcript.json 경로")
    parser.add_argument("--output", default="./output", help="출력 디렉토리")
    args = parser.parse_args()

    integrate(args.scenes, args.transcript, args.output)

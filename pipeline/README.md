# 막시마 편집 파이프라인 — 마스터 가이드

Premiere Pro(MCP) + Claude로 롱폼 브이로그를 컷편집하는 파이프라인.
**새 프로젝트를 열면 이 문서부터 읽고 시작한다.**

---

## 📁 파일 구성

| 파일 | 역할 | 실행 주체 |
|---|---|---|
| `README.md` | 이 문서 (전체 가이드) | 사람 |
| `EDITING_WORKFLOW.md` | **필수 워크플로우 + 규칙** (반드시 준수) | Claude |
| `claude_edit_prompt.md` | 편집 요청 프롬프트 템플릿 + 편집기술 | 사람→Claude |
| `install.sh` / `requirements.txt` | 환경 설치 (최초 1회) | 사람 |
| `srt_import.py` | SRT 파일 → captions.json | Claude/사람 |
| `build_frame_plan.py` | captions.json → 프레임 추출 타임코드 | Claude |
| `srt_export.py` | analysis/dialogue.json → SRT | Claude |
| `analyze_clips.py` | (오프라인) 소스클립 Scene+Whisper+프레임 통합분석 | 사람 |
| `batch_transcribe.py` | (오프라인) 소스클립 Whisper 전사만 | 사람 |
| `prepare_for_edit.py` | analyze_clips + srt_export 오케스트레이터 | 사람 |
| `scene_detect.py`/`transcribe.py`/`integrate.py`/`run_pipeline.py` | 단일영상 오프라인 파이프라인 부품 | 사람 |

---

## 🚀 새 프로젝트 시작 순서

### 0. 환경 (최초 1회만)
```bash
cd pipeline && bash install.sh
```
(Homebrew, ffmpeg, whisper, scenedetect 설치)

### 1. 사용자가 자막 준비 (외부 전사)
전사는 외부 프로그램(Whisper Mate 등)에서 한다. **런타임 Whisper는 느려서 안 씀.**
- 결과 `.srt` 파일을 확보 (Premiere 시퀀스에 캡션으로 넣어도 되고, 파일만 줘도 됨)
- ⚠️ **이 SRT가 "지금 편집할 raw 시퀀스"의 음성을 전사한 것인지 반드시 확인.**
  완성본(편집된 영상)에서 뽑은 자막이면 raw 편집에 못 쓴다. (이번 세션의 실패 원인)

### 2. Claude에게 요청
`claude_edit_prompt.md` 템플릿대로 요청하면 Claude가:
1. SRT 읽기 (`srt_import.py` 또는 `read_sequence_captions`)
2. **정렬 검증** — 자막 시점들의 실제 프레임을 뽑아 내용 대조 (STEP 2.5)
3. 프레임 추출(`build_frame_plan.py` + `export_frame`) → Vision 분석
4. **이해도 게이트** 제출 (클립별 요약 + 스토리 흐름 + 하이라이트 + 길이계획)
5. 사용자 확인 후 컷편집 실행

---

## ⚠️ 절대 규칙 (EDITING_WORKFLOW.md 요약)

1. **자막↔영상 정렬 검증 전에는 자르지 않는다.** 길이만 같고 내용이 다를 수 있다.
2. **자막 없이 프레임만 보고 편집 금지.** 대화·감정·이야기가 브이로그의 본체.
3. **이해도 게이트 통과 전 컷편집 금지.** 모든 구간을 파악했다고 사용자가 확인해야 함.
4. **영상·오디오 동시 삭제** (`razor_timeline_at_time` + `remove_from_timeline ripple`). 두 번 일 안 함.
5. **원본 보호** — 항상 `duplicate_sequence` 복제본에서 편집.
6. **롱폼 10~20분** — 원본의 30~50% 유지. 45분→2분 같은 과편집 금지.
7. **클립 순서 변경**(`move_clip`)은 필요할 때만, dialogue로 문맥 재검증.

---

## 🔧 MCP 사용 팁 (이번 세션에서 확인된 것)

- `export_frame`: 저장 폴더를 미리 `mkdir` 해야 함. 파일이 `.jpg.jpg`로 떨어질 수 있음.
- `read_sequence_captions`: Premiere 캡션 트랙을 못 읽는 경우가 있음 → SRT 파일 직접 사용(`srt_import.py`).
- `trim_clip`/`split_clip`: 적용 안 될 때가 있음 → `razor_timeline_at_time`(전 트랙 동시 컷)이 안정적.
- 권한: `.claude/settings.local.json` 에 `bypassPermissions` + MCP 와일드카드 설정됨 (프롬프트 없이 실행).

---

## 🧩 오프라인 경로 (선택)

SRT가 없고 raw 소스클립을 직접 분석해야 할 때:
```bash
# order.json = 시퀀스 클립 순서(파일명 배열)
python3 prepare_for_edit.py \
  --clips-dir "/소스폴더" --order ./output/order.json \
  --output ./output --language ko --model large-v3 --threshold 27
```
→ `analysis.json`(장면+대사+프레임) + `sequence.srt` 생성.
단, large-v3 전사는 매우 느리다. 가능하면 외부 전사(STEP 1)를 권장.

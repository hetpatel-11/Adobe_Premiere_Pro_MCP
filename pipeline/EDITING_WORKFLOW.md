# 편집 워크플로우 (필수 준수)

> ⚠️ **절대 규칙**: 아래 1~4단계를 모두 통과하기 전에는 **어떤 컷편집도 시작하지 않는다.**
> 클립 내용을 모른 채 프레임 이미지만 보고 편집하면 브이로그의 핵심(대화·감정·이야기)이
> 사라진다. 과거 실패 사례: 45분 촬영본을 2분 20초로 잘못 압축함.

---

## STEP 1~3 — 통합 분석 (Scene Detection + Whisper + Frame) 한 번에

설명한 4단계 파이프라인의 [1~3단계]를 `prepare_for_edit.py`가 자동 실행한다.
시퀀스에 들어간 **모든** 소스 클립이 대상이며, 일부만 처리하면 안 된다.

```bash
# 0. 시퀀스 클립 순서를 order.json으로 저장
#    (Claude가 list_sequence_tracks로 읽은 순서를 파일명 배열로 기록)

# 1~3단계 통합 실행
python3 prepare_for_edit.py \
  --clips-dir "/소스/클립/폴더" \
  --order ./output/order.json \
  --output ./output \
  --language en --model large-v3 --threshold 27
```

내부 동작 (클립마다 반복):
- **[1단계] PySceneDetect** → 장면 경계 타임코드 + 대표 프레임 자동 추출 (`frames/<clip>/`)
- **[2단계] Whisper** → 대사 전사
- **[3단계] 스냅 보정** → Whisper 타임코드를 Scene 경계로 교정 (오차 흡수)

산출물:
- `output/analysis.json` — 클립 → 장면 → {타임코드, 대사, 프레임경로}, 시퀀스 타임라인 매핑
- `output/sequence.srt` — 시퀀스 캡션 삽입용

그 다음 Premiere MCP로 자막 삽입:
- `create_caption_track` 로 `output/sequence.srt` 추가
- `read_sequence_captions` 로 삽입 검증

> ※ Whisper 단독만 빠르게 쓰고 싶으면 `batch_transcribe.py`(전사만)도 여전히 사용 가능.
>   단, 정확한 컷 타임코드/프레임 분석이 필요하면 `prepare_for_edit.py`(통합)를 쓴다.

---

## STEP 4 — Claude 통합 처리 + 이해도 게이트 (Comprehension Gate) ★필수★

[4단계]는 Claude가 수행한다:
- `frames/` 의 장면 이미지를 **직접 보고**(Vision) 장소/표정/행동 파악
- `analysis.json` 의 대사를 읽고 감정/중요도 판단

그 결과로 **반드시** 아래를 사용자에게 제출하고 확인받는다. 통과 못하면 컷편집 금지.

제출 항목:
1. **클립별 1줄 요약** — 모든 클립(예: 0041~0074)에 대해
   `[클립번호] 타임라인구간 | 장소 | 화자 | 핵심 대사/사건 | 감정 톤`
2. **전체 스토리 흐름** — 기승전결 또는 8단계 서클로 매핑
3. **하이라이트 후보** — 웃긴 순간, 감정 피크, 반전 지점 (타임코드 포함)
4. **목표 길이 계획** — 10~20분 롱폼. 각 서사 단계에 몇 분 배분할지

> 게이트 통과 기준: 사용자가 "맞아, 진행해"라고 확인. 또는 수정 피드백 반영 후 재확인.

---

## STEP 4 — 컷편집 실행 (대화·감정 보존)

게이트 통과 후에만 시작. 롱폼 브이로그 원칙:

- **대화는 자른다 ≠ 대화를 죽인다.** 말 끝나기 전에 끊지 말 것. 호흡/리액션 여백 유지.
- **삭제 단위는 "지루한 구간"이지 "대화 구간"이 아니다.** 침묵·이동·반복 준비과정만 압축.
- **목표는 10~20분.** 45분 → 2분은 명백한 과편집. 통상 롱폼은 원본의 30~50% 유지.
- 편집 기술은 `claude_edit_prompt.md`의 템플릿(Punch-In, Speed Ramp, J/L-Cut 등) 적용.

---

## 처리 규칙 (Process Rules)

### 규칙 A — 영상·오디오 동시 삭제 (Linked A/V Delete)
클립 일부를 삭제할 때 영상만 지우고 오디오를 따로 또 지우는 "두 번 일"을 하지 않는다.

- `razor_timeline_at_time` 은 **모든 트랙(영상+오디오)을 동시에** 자른다 → 이걸 우선 사용.
- 삭제는 `remove_from_timeline(deleteMode="ripple")` 로 해당 구간 영상+오디오를 한 번에 제거.
- 클립이 링크 해제돼 있으면 `link_audio_video(linked=true)` 로 먼저 링크 후 삭제.
- 절대 영상 클립 삭제 → 남은 오디오 따로 삭제 순서로 두 번 작업하지 않는다.

### 규칙 B — 클립 순서 유동적 변경 (Reorder, 필요할 때만)
재미를 위해 시간 순서를 바꾸는 게 나을 때만 사용. 기본은 촬영 순서 유지.

- `move_clip(clipId, newTime, newTrackIndex)` 로 위치 이동.
- 순서를 바꾸면 대사 흐름/문맥이 깨지지 않는지 dialogue_map.json으로 반드시 재검증.
- 예: 하이라이트(반전 리액션)를 오프닝 훅으로 앞당기기 → 단, 원래 위치엔 맥락 남기기.

### 규칙 C — 원본 보호
편집은 항상 `duplicate_sequence` 로 복제본에서 진행. 원본 시퀀스는 손대지 않는다.
